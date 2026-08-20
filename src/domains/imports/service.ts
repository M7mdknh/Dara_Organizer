import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { normalizeArabic } from "@/services/normalization";
import { matchExpression, matchSentence } from "@/services/matching";
import { recordRevision } from "@/services/revisions";
import { judgeExpressionAgainstConcepts } from "@/services/matching/semantic";
import { logger } from "@/lib/logger";

/**
 * Import processing: every mapped row goes through the matching engine.
 * Exact/normalized matches with compatible context are recorded as MATCHED
 * (idempotent, no reviewer burden). Semantic overlaps and dialect
 * disagreements create ReviewItems. Nothing is silently merged or replaced.
 */

export const importMappingSchema = z.object({
  target: z.enum(["expression", "sentence"]),
  columns: z.record(z.string(), z.string()), // field -> source column name
  defaults: z.object({
    languageId: z.string(),
    dialectId: z.string().nullish(),
    quality: z.enum(["GOLD", "SILVER", "REFERENCE", "CANDIDATE"]).default("CANDIDATE"),
    training: z.enum(["ELIGIBLE", "NOT_ELIGIBLE", "UNDECIDED"]).default("UNDECIDED"),
  }),
});

export type ImportMapping = z.infer<typeof importMappingSchema>;

export const EXPRESSION_FIELDS = [
  { key: "text", label: "Expression text", required: true },
  { key: "conceptKey", label: "Concept key (e.g. TIME_NOW)" },
  { key: "meaning", label: "Meaning / gloss" },
  { key: "dialect", label: "Dialect (name or slug)" },
  { key: "language", label: "Language (code)" },
  { key: "commonness", label: "Commonness" },
  { key: "register", label: "Register" },
  { key: "pronunciation", label: "Pronunciation (Arabic phonetic)" },
  { key: "ipa", label: "Pronunciation (IPA)" },
  { key: "category", label: "Category" },
  { key: "notes", label: "Notes" },
] as const;

export const SENTENCE_FIELDS = [
  { key: "text", label: "Sentence text", required: true },
  { key: "meaning", label: "Meaning (English/other)" },
  { key: "dialect", label: "Dialect (name or slug)" },
  { key: "language", label: "Language (code)" },
  { key: "utteranceGroup", label: "Utterance group name" },
  { key: "intent", label: "Intent" },
  { key: "situation", label: "Situation" },
  { key: "register", label: "Register" },
  { key: "category", label: "Category" },
  { key: "pronunciation", label: "Pronunciation (Arabic phonetic)" },
  { key: "notes", label: "Notes" },
] as const;

const COMMONNESS_MAP: Record<string, string> = {
  "very high": "VERY_HIGH",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
  rare: "RARE",
  contextual: "CONTEXTUAL",
};

interface ResolverCaches {
  dialects: Map<string, string>;
  languages: Map<string, string>;
  registers: Map<string, string>;
  intents: Map<string, string>;
  situations: Map<string, string>;
  categories: Map<string, string>;
  groups: Map<string, string>;
  concepts: Map<string, string>;
}

async function buildCaches(): Promise<ResolverCaches> {
  const [dialects, languages, registers, intents, situations, categories, groups, concepts] =
    await Promise.all([
      db.dialectNode.findMany(),
      db.language.findMany(),
      db.register.findMany(),
      db.intent.findMany(),
      db.situation.findMany(),
      db.category.findMany(),
      db.utteranceGroup.findMany(),
      db.concept.findMany({ select: { id: true, key: true } }),
    ]);
  const norm = (s: string) => s.trim().toLowerCase();
  const caches: ResolverCaches = {
    dialects: new Map(),
    languages: new Map(),
    registers: new Map(),
    intents: new Map(),
    situations: new Map(),
    categories: new Map(),
    groups: new Map(),
    concepts: new Map(),
  };
  for (const d of dialects) {
    caches.dialects.set(norm(d.name), d.id);
    caches.dialects.set(norm(d.slug), d.id);
    if (d.nameAr) caches.dialects.set(norm(d.nameAr), d.id);
  }
  for (const l of languages) {
    caches.languages.set(norm(l.code), l.id);
    caches.languages.set(norm(l.name), l.id);
  }
  for (const r of registers) caches.registers.set(norm(r.name), r.id);
  for (const i of intents) caches.intents.set(norm(i.name), i.id);
  for (const s of situations) caches.situations.set(norm(s.name), s.id);
  for (const c of categories) caches.categories.set(norm(c.name), c.id);
  for (const g of groups) caches.groups.set(norm(g.name), g.id);
  for (const c of concepts) caches.concepts.set(c.key, c.id);
  return caches;
}

function fieldValue(row: Record<string, string>, mapping: ImportMapping, field: string): string {
  const col = mapping.columns[field];
  if (!col) return "";
  return (row[col] ?? "").trim();
}

export async function processImportJob(jobId: string, userId: string) {
  const job = await db.importJob.findUnique({ where: { id: jobId }, include: { rows: { orderBy: { rowIndex: "asc" } } } });
  if (!job) throw new Error("Import job not found");
  const mapping = importMappingSchema.parse(job.mapping);
  const caches = await buildCaches();

  // Resumable/idempotent: rows already marked processedAt from a prior
  // (possibly interrupted) attempt are skipped. Seed counters are
  // RECOMPUTED from actual ImportRow statuses rather than trusting the
  // job's last periodic checkpoint (processedRows/accepted/... are only
  // persisted every IMPORT_CHUNK_SIZE rows) — a hard kill between two
  // checkpoints can leave more rows durably processed (each row's
  // processedAt is written individually) than the last checkpoint
  // recorded, and seeding from the stale checkpoint would silently drop
  // those rows from the final totals even though they were correctly
  // skipped from reprocessing.
  const alreadyProcessed = job.rows.filter((r) => r.processedAt);
  const rowsToProcess = job.rows.filter((r) => !r.processedAt);

  await db.importJob.update({
    where: { id: jobId },
    data: { status: "PROCESSING", startedAt: job.startedAt ?? new Date(), attempts: { increment: 1 } },
  });

  let accepted = 0,
    matched = 0,
    conflicts = 0,
    semanticCandidates = 0,
    duplicates = 0,
    errors = 0,
    processedRows = alreadyProcessed.length;
  for (const row of alreadyProcessed) {
    switch (row.status) {
      case "ACCEPTED":
        accepted++;
        break;
      case "MATCHED":
        matched++;
        break;
      case "CONFLICT":
        conflicts++;
        if (row.message === "semantic_candidate") semanticCandidates++;
        break;
      case "SKIPPED":
        duplicates++;
        break;
      case "ERROR":
        errors++;
        break;
    }
  }
  const errorLog: { row: number; message: string }[] = [];
  const seenInFile = new Map<string, string>(); // normalized text -> first row disposition
  const progressChunk = Math.max(1, env.IMPORT_CHUNK_SIZE);

  for (const row of rowsToProcess) {
    const raw = row.rawData as Record<string, string>;
    try {
      const text = fieldValue(raw, mapping, "text");
      if (!text) {
        errors++;
        errorLog.push({ row: row.rowIndex, message: "Empty text" });
        await db.importRow.update({ where: { id: row.id }, data: { status: "ERROR", message: "Empty text", processedAt: new Date() } });
        processedRows++;
        continue;
      }
      const norm = (s: string) => s.trim().toLowerCase();
      const dialectRaw = fieldValue(raw, mapping, "dialect");
      const dialectId = dialectRaw
        ? (caches.dialects.get(norm(dialectRaw)) ?? mapping.defaults.dialectId ?? null)
        : (mapping.defaults.dialectId ?? null);
      const langRaw = fieldValue(raw, mapping, "language");
      const languageId = langRaw
        ? (caches.languages.get(norm(langRaw)) ?? mapping.defaults.languageId)
        : mapping.defaults.languageId;

      // In-file duplicate detection
      const fileKey = `${normalizeArabic(text)}::${dialectId ?? ""}::${languageId}`;
      if (seenInFile.has(fileKey)) {
        duplicates++;
        await db.importRow.update({
          where: { id: row.id },
          data: { status: "SKIPPED", message: `Duplicate of row ${seenInFile.get(fileKey)} in this file`, processedAt: new Date() },
        });
        processedRows++;
        continue;
      }
      seenInFile.set(fileKey, String(row.rowIndex));

      if (mapping.target === "expression") {
        const result = await importExpressionRow(raw, mapping, caches, {
          text,
          dialectId,
          languageId,
          jobId,
          sourceId: job.sourceId,
          userId,
          rowId: row.id,
          rowIndex: row.rowIndex,
        });
        if (result === "accepted") accepted++;
        else if (result === "matched") matched++;
        else if (result === "semantic_candidate") {
          conflicts++;
          semanticCandidates++;
        } else conflicts++;
        await db.importRow.update({ where: { id: row.id }, data: { processedAt: new Date() } });
      } else {
        const result = await importSentenceRow(raw, mapping, caches, {
          text,
          dialectId,
          languageId,
          jobId,
          sourceId: job.sourceId,
          userId,
          rowId: row.id,
          rowIndex: row.rowIndex,
        });
        if (result === "accepted") accepted++;
        else matched++;
        await db.importRow.update({ where: { id: row.id }, data: { processedAt: new Date() } });
      }
    } catch (err) {
      errors++;
      const message = err instanceof Error ? err.message : "Unknown error";
      errorLog.push({ row: row.rowIndex, message });
      await db.importRow.update({ where: { id: row.id }, data: { status: "ERROR", message, processedAt: new Date() } });
    }

    processedRows++;
    // Durable progress: persisted periodically (not every row) so a worker
    // restart or a browser refresh never loses more than one chunk of
    // progress, without hammering the database on every single row.
    if (processedRows % progressChunk === 0) {
      await db.importJob.update({ where: { id: jobId }, data: { processedRows, accepted, matched, conflicts, semanticCandidates, duplicates, errors } });
    }
  }

  return db.importJob.update({
    where: { id: jobId },
    data: {
      status: "COMPLETED",
      processedRows,
      accepted,
      matched,
      conflicts,
      semanticCandidates,
      duplicates,
      errors,
      errorLog: errorLog.slice(0, 500) as unknown as Prisma.InputJsonValue,
      finishedAt: new Date(),
    },
  });
}

interface RowCtx {
  text: string;
  dialectId: string | null;
  languageId: string;
  jobId: string;
  sourceId: string;
  userId: string;
  rowId: string;
  rowIndex: number;
}

async function importExpressionRow(
  raw: Record<string, string>,
  mapping: ImportMapping,
  caches: ResolverCaches,
  ctx: RowCtx,
): Promise<"accepted" | "matched" | "conflict" | "semantic_candidate"> {
  const norm = (s: string) => s.trim().toLowerCase();
  // Resolve/create concept if a key was mapped
  let conceptId: string | null = null;
  const conceptKey = fieldValue(raw, mapping, "conceptKey").toUpperCase().replace(/\s+/g, "_");
  const meaning = fieldValue(raw, mapping, "meaning");
  if (conceptKey) {
    conceptId = caches.concepts.get(conceptKey) ?? null;
    if (!conceptId) {
      const concept = await db.concept.create({
        data: { key: conceptKey, gloss: meaning || conceptKey, origin: "IMPORT", sourceId: ctx.sourceId },
      });
      caches.concepts.set(conceptKey, concept.id);
      conceptId = concept.id;
    }
  }

  const match = await matchExpression(db, {
    textOriginal: ctx.text,
    languageId: ctx.languageId,
    dialectId: ctx.dialectId,
    conceptId,
  });

  if (match.kind === "exact" || match.kind === "normalized") {
    if (conceptId) {
      await db.conceptExpression.upsert({
        where: { conceptId_expressionId: { conceptId, expressionId: match.expressionId } },
        create: { conceptId, expressionId: match.expressionId },
        update: {},
      });
    }
    await db.importRow.update({
      where: { id: ctx.rowId },
      data: { status: "MATCHED", entityType: "expression", entityId: match.expressionId, message: `${match.kind} match` },
    });
    return "matched";
  }

  const commonnessRaw = fieldValue(raw, mapping, "commonness");
  const commonness = COMMONNESS_MAP[norm(commonnessRaw)] ?? "UNKNOWN";
  const registerId = caches.registers.get(norm(fieldValue(raw, mapping, "register"))) ?? null;
  const categoryId = caches.categories.get(norm(fieldValue(raw, mapping, "category"))) ?? null;

  const created = await db.expression.create({
    data: {
      textOriginal: ctx.text,
      textNormalized: normalizeArabic(ctx.text),
      languageId: ctx.languageId,
      dialectId: ctx.dialectId,
      registerId,
      commonness: commonness as never,
      meaningNote: meaning || null,
      usageNote: fieldValue(raw, mapping, "notes") || null,
      quality: mapping.defaults.quality,
      training: mapping.defaults.training,
      origin: "IMPORT",
      sourceId: ctx.sourceId,
      ...(conceptId ? { concepts: { create: { conceptId } } } : {}),
      ...(categoryId ? { categories: { create: { categoryId } } } : {}),
    },
  });
  const pron = fieldValue(raw, mapping, "pronunciation");
  const ipa = fieldValue(raw, mapping, "ipa");
  if (pron || ipa) {
    await db.pronunciation.create({
      data: {
        expressionId: created.id,
        dialectId: ctx.dialectId,
        arabicPhonetic: pron || null,
        ipa: ipa || null,
        origin: "IMPORT",
      },
    });
  }
  await recordRevision(db, { entityType: "expression", entityId: created.id, kind: "CREATE", newValue: created, userId: ctx.userId, reason: `Import row ${ctx.rowIndex}` });

  if (match.kind === "semantic_conflict" || match.kind === "dialect_conflict") {
    await db.reviewItem.create({
      data: {
        type: match.kind === "semantic_conflict" ? "SEMANTIC_CONFLICT" : "DIALECT_UNCERTAIN",
        title:
          match.kind === "semantic_conflict"
            ? `Imported "${ctx.text}" overlaps existing expressions for the same concept`
            : `Imported "${ctx.text}" exists under a different dialect`,
        payload: {
          candidate: { id: created.id, text: ctx.text, dialectId: ctx.dialectId },
          competing: match.kind === "semantic_conflict" ? match.competingExpressionIds : [match.expressionId],
          conceptId,
          importRow: ctx.rowIndex,
        } as Prisma.InputJsonValue,
        entityType: "expression",
        entityId: created.id,
        candidateEntityId:
          match.kind === "semantic_conflict" ? match.competingExpressionIds[0] : match.expressionId,
        importJobId: ctx.jobId,
      },
    });
    await db.importRow.update({
      where: { id: ctx.rowId },
      data: { status: "CONFLICT", entityType: "expression", entityId: created.id, message: match.kind },
    });
    return "conflict";
  }

  // Semantic cascade: only reached when deterministic matching found no
  // exact/normalized/dialect/concept conflict AND no concept was already
  // explicitly mapped from the import. Vector retrieval + LLM judgment
  // surface candidate concepts as a review suggestion; nothing is linked
  // automatically (SEMANTIC_AUTO_APPROVE is not honored here by design —
  // semantic conflicts always require a human decision, per policy).
  if (!conceptId && env.SEMANTIC_MATCHING_ENABLED) {
    const dialectName = ctx.dialectId
      ? (await db.dialectNode.findUnique({ where: { id: ctx.dialectId }, select: { name: true } }))?.name ?? null
      : null;
    const evidence = await judgeExpressionAgainstConcepts({
      text: ctx.text,
      dialectName,
      sourceSentence: null,
    }).catch((err) => {
      logger.warn("semantic_matching.judgment_failed", { rowIndex: ctx.rowIndex, error: err instanceof Error ? err.message : String(err) });
      return null;
    });
    // SAME/RELATED/UNCERTAIN all route to review — per policy, only a
    // confident DIFFERENT judgment (or no candidates at all) is safe to
    // leave unflagged. UNCERTAIN is explicitly review-worthy, not silently
    // dropped: an unresolved semantic question is exactly what a human
    // reviewer should see.
    if (evidence && evidence.candidates.length > 0 && evidence.modelDecision !== "DIFFERENT" && evidence.modelDecision !== null) {
      await db.reviewItem.create({
        data: {
          type: "SEMANTIC_CONFLICT",
          title:
            evidence.modelDecision === "UNCERTAIN"
              ? `AI judgment uncertain for "${ctx.text}" vs concept ${evidence.candidates[0].key}`
              : `AI suggests "${ctx.text}" may belong to concept ${evidence.candidates[0].key}`,
          payload: {
            candidate: { id: created.id, text: ctx.text, dialectId: ctx.dialectId },
            semanticEvidence: evidence,
            importRow: ctx.rowIndex,
          } as unknown as Prisma.InputJsonValue,
          entityType: "expression",
          entityId: created.id,
          candidateEntityId: null,
          importJobId: ctx.jobId,
        },
      });
      await db.importRow.update({
        where: { id: ctx.rowId },
        data: { status: "CONFLICT", entityType: "expression", entityId: created.id, message: "semantic_candidate" },
      });
      return "semantic_candidate";
    }
  }

  await db.importRow.update({
    where: { id: ctx.rowId },
    data: { status: "ACCEPTED", entityType: "expression", entityId: created.id },
  });
  return "accepted";
}

async function importSentenceRow(
  raw: Record<string, string>,
  mapping: ImportMapping,
  caches: ResolverCaches,
  ctx: RowCtx,
): Promise<"accepted" | "matched"> {
  const norm = (s: string) => s.trim().toLowerCase();
  const match = await matchSentence(db, {
    textOriginal: ctx.text,
    languageId: ctx.languageId,
    dialectId: ctx.dialectId,
  });
  if (match.kind === "exact" || match.kind === "normalized") {
    await db.importRow.update({
      where: { id: ctx.rowId },
      data: { status: "MATCHED", entityType: "sentence", entityId: match.sentenceId, message: `${match.kind} match` },
    });
    return "matched";
  }

  const groupName = fieldValue(raw, mapping, "utteranceGroup");
  let utteranceGroupId: string | null = null;
  if (groupName) {
    utteranceGroupId = caches.groups.get(norm(groupName)) ?? null;
    if (!utteranceGroupId) {
      const g = await db.utteranceGroup.create({ data: { name: groupName } });
      caches.groups.set(norm(groupName), g.id);
      utteranceGroupId = g.id;
    }
  }
  const intentId = caches.intents.get(norm(fieldValue(raw, mapping, "intent"))) ?? null;
  const situationId = caches.situations.get(norm(fieldValue(raw, mapping, "situation"))) ?? null;
  const registerId = caches.registers.get(norm(fieldValue(raw, mapping, "register"))) ?? null;
  const categoryId = caches.categories.get(norm(fieldValue(raw, mapping, "category"))) ?? null;

  const created = await db.sentence.create({
    data: {
      textOriginal: ctx.text,
      textNormalized: normalizeArabic(ctx.text),
      languageId: ctx.languageId,
      dialectId: ctx.dialectId,
      meaning: fieldValue(raw, mapping, "meaning") || null,
      utteranceGroupId,
      intentId,
      situationId,
      registerId,
      quality: mapping.defaults.quality,
      training: mapping.defaults.training,
      origin: "IMPORT",
      sourceId: ctx.sourceId,
      ...(categoryId ? { categories: { create: { categoryId } } } : {}),
    },
  });
  const pron = fieldValue(raw, mapping, "pronunciation");
  if (pron) {
    await db.pronunciation.create({
      data: { sentenceId: created.id, dialectId: ctx.dialectId, arabicPhonetic: pron, origin: "IMPORT" },
    });
  }
  await recordRevision(db, { entityType: "sentence", entityId: created.id, kind: "CREATE", newValue: created, userId: ctx.userId, reason: `Import row ${ctx.rowIndex}` });
  await db.importRow.update({
    where: { id: ctx.rowId },
    data: { status: "ACCEPTED", entityType: "sentence", entityId: created.id },
  });
  return "accepted";
}
