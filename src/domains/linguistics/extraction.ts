import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizeArabic } from "@/services/normalization";
import { matchExpression } from "@/services/matching";
import { resolveProvider } from "@/services/ai/enrichment";
import { judgeExpressionAgainstConcepts } from "@/services/matching/semantic";
import { recordRevision } from "@/services/revisions";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Deep linguistic extraction: given an already-imported sentence, ask AI to
 * find the meaningful words/phrases it contains, their MSA canonical form,
 * and sentence-level translations for enabled languages — then organize
 * that into the Concept graph.
 *
 * Reuse-before-create (CLAUDE.md rule 5, and cost control): every extracted
 * item is checked against EXISTING concepts via the same pgvector + LLM
 * judgment cascade already used for import conflict detection
 * (judgeExpressionAgainstConcepts) before a new Concept is ever created.
 * SAME -> link to the existing concept. DIFFERENT / no candidates -> create
 * a new concept (still AI origin, SILVER quality, routed for eventual human
 * verification like any AI data). RELATED / UNCERTAIN are never
 * auto-applied — they become a Review Inbox item, same shape the semantic
 * import-conflict cards already render.
 *
 * Idempotent: an EnrichmentJob(type="extract_linguistics") COMPLETED record
 * for the sentence means "already done" — safe to call repeatedly (e.g. on
 * queue retry) without creating duplicate concepts/links.
 */

const ExtractionSchema = z.object({
  msaEquivalent: z.string().nullable(),
  items: z
    .array(
      z.object({
        text: z.string(),
        type: z.enum(["WORD", "PHRASE", "IDIOM"]),
        conceptGloss: z.string(),
        msaForm: z.string().nullable(),
      }),
    )
    .max(10),
  translations: z.array(z.object({ languageCode: z.string(), text: z.string() })).max(10),
});
type Extraction = z.infer<typeof ExtractionSchema>;

const EXTRACTION_JSON_SCHEMA = {
  name: "linguistic_extraction",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      msaEquivalent: { type: ["string", "null"], description: "Natural Modern Standard Arabic rendering of the whole sentence's meaning, or null if the sentence is not Arabic." },
      items: {
        type: "array",
        maxItems: 10,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            text: { type: "string", description: "The exact word or phrase as it appears in the sentence (original spelling, not corrected)." },
            type: { type: "string", enum: ["WORD", "PHRASE", "IDIOM"] },
            conceptGloss: { type: "string", description: "Short English gloss of what this word/phrase means, e.g. 'at the present time'." },
            msaForm: { type: ["string", "null"], description: "The canonical Modern Standard Arabic form of this concept, or null if not applicable / not Arabic." },
          },
          required: ["text", "type", "conceptGloss", "msaForm"],
        },
      },
      translations: {
        type: "array",
        maxItems: 10,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            languageCode: { type: "string", description: "e.g. en, fr, es" },
            text: { type: "string" },
          },
          required: ["languageCode", "text"],
        },
      },
    },
    required: ["msaEquivalent", "items", "translations"],
  },
};

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function buildPrompt(params: {
  text: string;
  dialectName: string | null;
  languageName: string;
  enabledLanguageNames: string[];
}): string {
  return [
    `Sentence: "${params.text}"`,
    `Dialect: ${params.dialectName ?? "unknown"}`,
    `Language: ${params.languageName}`,
    "",
    "Extract only linguistically meaningful units (words, conventional phrases, idioms) that are useful vocabulary — skip meaningless fragments and pure grammatical particles unless they carry real dialectal/conversational value. Avoid tokenizing a fixed phrase into separate meaningless words when the phrase itself carries the meaning.",
    `Also provide natural (not word-for-word literal) translations into: ${params.enabledLanguageNames.join(", ")}.`,
    "Never fabricate confidence — if the sentence is too short/unclear for a given field, use null or an empty array.",
  ].join("\n");
}

function slugifyKey(gloss: string): string {
  return gloss
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "CONCEPT";
}

async function uniqueConceptKey(tx: Tx, gloss: string): Promise<string> {
  const base = slugifyKey(gloss);
  let key = base;
  let n = 1;
  while (await tx.concept.findUnique({ where: { key } })) {
    n++;
    key = `${base}_${n}`;
  }
  return key;
}

/** Finds a matching expression (exact/normalized) or creates one; returns null when the row conflicts (routed to review instead, never silently duplicated). */
async function findOrCreateExpression(
  tx: Tx,
  params: {
    text: string;
    languageId: string;
    dialectId: string | null;
    type: "WORD" | "PHRASE" | "IDIOM";
    sourceId: string | null;
    conceptId: string | null;
    provider: { name: string; model: string };
  },
): Promise<string | null> {
  const match = await matchExpression(tx, {
    textOriginal: params.text,
    languageId: params.languageId,
    dialectId: params.dialectId,
    conceptId: params.conceptId,
  });
  if (match.kind === "exact" || match.kind === "normalized") return match.expressionId;
  if (match.kind === "dialect_conflict" || match.kind === "semantic_conflict") return null;

  const created = await tx.expression.create({
    data: {
      textOriginal: params.text,
      textNormalized: normalizeArabic(params.text),
      languageId: params.languageId,
      dialectId: params.dialectId,
      type: params.type,
      quality: "SILVER",
      verification: "UNVERIFIED",
      origin: "AI",
      aiProvider: params.provider.name,
      aiModel: params.provider.model,
      aiGeneratedAt: new Date(),
      sourceId: params.sourceId,
    },
  });
  await recordRevision(tx, { entityType: "expression", entityId: created.id, kind: "CREATE", newValue: created, reason: "AI linguistic extraction" });
  return created.id;
}

export async function extractLinguisticKnowledge(sentenceId: string): Promise<{ status: "completed" | "skipped" | "no_provider" }> {
  const sentence = await db.sentence.findUnique({
    where: { id: sentenceId },
    include: { dialect: true, language: true },
  });
  if (!sentence) return { status: "skipped" };

  const already = await db.enrichmentJob.findFirst({
    where: { type: "extract_linguistics", entityType: "sentence", entityId: sentenceId, status: "COMPLETED" },
  });
  if (already) return { status: "skipped" };

  const provider = await resolveProvider();
  if (!provider) return { status: "no_provider" };

  const enabledLanguages = await db.language.findMany({ where: { enabled: true, aiEnrichmentEnabled: true } });
  const msaLanguage = enabledLanguages.find((l) => l.code === "ar-MSA") ?? null;
  const translationTargets = enabledLanguages.filter((l) => l.code !== "ar-MSA" && l.code !== sentence.language.code);

  const job = await db.enrichmentJob.create({
    data: {
      type: "extract_linguistics",
      status: "RUNNING",
      provider: provider.name,
      model: provider.model,
      entityType: "sentence",
      entityId: sentenceId,
      startedAt: new Date(),
    },
  });

  let data: Extraction;
  try {
    const result = await provider.complete({
      system:
        "You are an Arabic dialectology linguist extracting reusable vocabulary and translations from a sentence for a training-data platform. Be conservative and evidence-based; never fabricate.",
      prompt: buildPrompt({
        text: sentence.textOriginal,
        dialectName: sentence.dialect?.name ?? null,
        languageName: sentence.language.name,
        enabledLanguageNames: translationTargets.map((l) => l.name),
      }),
      jsonSchema: EXTRACTION_JSON_SCHEMA,
      reasoningEffort: "low",
    });
    const raw = result.json ?? safeParseJson(result.text);
    const parsed = ExtractionSchema.safeParse(raw);
    if (!parsed.success) {
      await db.enrichmentJob.update({
        where: { id: job.id },
        data: { status: "FAILED", error: "Model output failed schema validation", finishedAt: new Date() },
      });
      return { status: "skipped" };
    }
    data = parsed.data;

    // Judgment calls hit the embedding API + LLM over the network — they
    // must never run inside a DB transaction (would hold locks open for the
    // duration of external HTTP calls). Precompute evidence for every item
    // first; the transaction below only performs DB writes from that
    // already-resolved evidence.
    const itemsWithEvidence = await Promise.all(
      data.items
        .map((item) => ({ ...item, text: item.text.trim() }))
        .filter((item) => item.text)
        .map(async (item) => ({
          item,
          evidence: await judgeExpressionAgainstConcepts({
            text: item.text,
            dialectName: sentence.dialect?.name ?? null,
            sourceSentence: sentence.textOriginal,
          }),
        })),
    );

    await db.$transaction(async (tx) => {
      let primaryConceptId: string | null = null;

      for (const { item, evidence } of itemsWithEvidence) {
        const text = item.text;

        let conceptId: string | null = null;
        if (evidence?.modelDecision === "SAME" && evidence.chosenConceptId) {
          conceptId = evidence.chosenConceptId;
        } else if (!evidence || evidence.modelDecision === "DIFFERENT" || evidence.modelDecision === null) {
          const key = await uniqueConceptKey(tx, item.conceptGloss);
          const concept = await tx.concept.create({
            data: { key, gloss: item.conceptGloss, canonicalMsa: item.msaForm, origin: "AI", sourceId: sentence.sourceId },
          });
          await recordRevision(tx, { entityType: "concept", entityId: concept.id, kind: "CREATE", newValue: concept, reason: "AI linguistic extraction" });
          conceptId = concept.id;
        } else {
          // RELATED or UNCERTAIN — never auto-linked, always a human decision.
          await tx.reviewItem.create({
            data: {
              type: "MEANING_UNCERTAIN",
              title: `AI-extracted "${text}" may relate to an existing meaning`,
              payload: {
                candidate: { text, dialectId: sentence.dialectId },
                semanticEvidence: evidence,
              } as unknown as Prisma.InputJsonValue,
              entityType: "sentence",
              entityId: sentence.id,
            },
          });
          continue;
        }
        if (!conceptId) continue;
        if (!primaryConceptId) primaryConceptId = conceptId;

        const exprId = await findOrCreateExpression(tx, {
          text,
          languageId: sentence.languageId,
          dialectId: sentence.dialectId,
          type: item.type,
          sourceId: sentence.sourceId,
          conceptId,
          provider,
        });
        if (!exprId) continue;

        await tx.conceptExpression.upsert({
          where: { conceptId_expressionId: { conceptId, expressionId: exprId } },
          update: {},
          create: { conceptId, expressionId: exprId, isPrimary: true },
        });
        await tx.sentenceConcept.upsert({
          where: { sentenceId_conceptId: { sentenceId: sentence.id, conceptId } },
          update: {},
          create: { sentenceId: sentence.id, conceptId },
        });
        await tx.sentenceExpression.upsert({
          where: { sentenceId_expressionId: { sentenceId: sentence.id, expressionId: exprId } },
          update: {},
          create: { sentenceId: sentence.id, expressionId: exprId },
        });

        // MSA canonicalization: attach the concept's canonical MSA expression
        // (never replaces the original dialect text — purely additive).
        if (item.msaForm && msaLanguage) {
          const msaExprId = await findOrCreateExpression(tx, {
            text: item.msaForm,
            languageId: msaLanguage.id,
            dialectId: null,
            type: item.type,
            sourceId: sentence.sourceId,
            conceptId,
            provider,
          });
          if (msaExprId) {
            await tx.conceptExpression.upsert({
              where: { conceptId_expressionId: { conceptId, expressionId: msaExprId } },
              update: {},
              create: { conceptId, expressionId: msaExprId, isPrimary: true },
            });
            await tx.concept.update({ where: { id: conceptId }, data: { canonicalMsa: item.msaForm } });
          }
        }
      }

      // Sentence-level translations attach to the sentence's primary
      // extracted concept (a sentence may express more than one concept;
      // the first one extracted is treated as primary — a documented
      // simplification, not a hard modeling constraint).
      if (primaryConceptId) {
        for (const t of data.translations) {
          const lang = translationTargets.find((l) => l.code === t.languageCode);
          const text = t.text.trim();
          if (!lang || !text) continue;
          const exprId = await findOrCreateExpression(tx, {
            text,
            languageId: lang.id,
            dialectId: null,
            type: "EXPRESSION" as never,
            sourceId: sentence.sourceId,
            conceptId: primaryConceptId,
            provider,
          });
          if (!exprId) continue;
          await tx.conceptExpression.upsert({
            where: { conceptId_expressionId: { conceptId: primaryConceptId, expressionId: exprId } },
            update: {},
            create: { conceptId: primaryConceptId, expressionId: exprId, isPrimary: false },
          });
        }
      }

      // Equivalent-utterance grouping: link this sentence and its MSA
      // rendering into the same UtteranceGroup so "equivalent utterances
      // are preferred over literal translations" (CLAUDE.md rule 7) is a
      // queryable structure, not just prose.
      if (data.msaEquivalent && msaLanguage && sentence.language.code !== "ar-MSA") {
        let groupId = sentence.utteranceGroupId;
        if (!groupId) {
          const group = await tx.utteranceGroup.create({ data: { name: data.msaEquivalent.slice(0, 120) } });
          groupId = group.id;
          await tx.sentence.update({ where: { id: sentence.id }, data: { utteranceGroupId: groupId } });
        }
        const sentenceMatch = await tx.sentence.findFirst({
          where: { textNormalized: normalizeArabic(data.msaEquivalent), languageId: msaLanguage.id },
          select: { id: true, utteranceGroupId: true },
        });
        if (sentenceMatch) {
          if (!sentenceMatch.utteranceGroupId) {
            await tx.sentence.update({ where: { id: sentenceMatch.id }, data: { utteranceGroupId: groupId } });
          }
        } else {
          const msaSentence = await tx.sentence.create({
            data: {
              textOriginal: data.msaEquivalent,
              textNormalized: normalizeArabic(data.msaEquivalent),
              languageId: msaLanguage.id,
              meaning: sentence.meaning,
              utteranceGroupId: groupId,
              quality: "SILVER",
              verification: "UNVERIFIED",
              origin: "AI",
              aiProvider: provider.name,
              aiModel: provider.model,
              aiGeneratedAt: new Date(),
              sourceId: sentence.sourceId,
            },
          });
          await recordRevision(tx, { entityType: "sentence", entityId: msaSentence.id, kind: "CREATE", newValue: msaSentence, reason: "AI linguistic extraction (MSA equivalent)" });
        }
      }
    });

    await db.enrichmentJob.update({
      where: { id: job.id },
      data: { status: "COMPLETED", output: data as unknown as Prisma.InputJsonValue, finishedAt: new Date() },
    });
    return { status: "completed" };
  } catch (err) {
    await db.enrichmentJob.update({
      where: { id: job.id },
      data: { status: "FAILED", error: err instanceof Error ? err.message : "Unknown error", finishedAt: new Date() },
    });
    throw err;
  }
}
