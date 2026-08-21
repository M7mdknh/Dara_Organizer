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
  englishMeaning: z.string().nullable(),
  intent: z.string().nullable(),
  register: z.enum(["Formal", "Casual", "Intimate", "Neutral"]).nullable(),
  naturalness: z.enum(["NATURAL", "ACCEPTABLE", "UNNATURAL", "UNKNOWN"]),
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
      englishMeaning: { type: ["string", "null"], description: "A natural, concise English equivalent of the whole sentence's meaning (not a literal word-for-word gloss)." },
      intent: {
        type: ["string", "null"],
        description: "Conversational intent as an UPPER_SNAKE_CASE label, e.g. ASK_WELLBEING, PRAISE, ASK_LOCATION, APPRECIATION, STATEMENT. Null if no clear conversational intent applies (e.g. narrative/descriptive text).",
      },
      register: { type: ["string", "null"], enum: ["Formal", "Casual", "Intimate", "Neutral", null], description: "Null only if genuinely not determinable." },
      naturalness: {
        type: "string",
        enum: ["NATURAL", "ACCEPTABLE", "UNNATURAL", "UNKNOWN"],
        description: "Does this read like real natural spoken dialect (not machine-translated or MSA-contaminated)? UNKNOWN if you can't tell.",
      },
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
    required: ["msaEquivalent", "englishMeaning", "intent", "register", "naturalness", "items", "translations"],
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
    "Also assess: a concise natural English meaning of the whole sentence, its conversational intent (if any), register, and naturalness.",
    "Never fabricate confidence — if the sentence is too short/unclear for a given field, use null (or UNKNOWN for naturalness, or an empty array for lists).",
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

/** Case-insensitive reuse-before-create for simple name-keyed taxonomies (Intent, Register) — conservative, avoids creating near-duplicate labels for every sentence. */
async function resolveIntent(tx: Tx, name: string | null): Promise<string | null> {
  if (!name?.trim()) return null;
  const label = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!label) return null;
  const existing = await tx.intent.findFirst({ where: { name: { equals: label, mode: "insensitive" } } });
  if (existing) return existing.id;
  const created = await tx.intent.create({ data: { name: label } });
  return created.id;
}

async function resolveRegister(tx: Tx, name: string | null): Promise<string | null> {
  if (!name?.trim()) return null;
  const existing = await tx.register.findFirst({ where: { name: { equals: name.trim(), mode: "insensitive" } } });
  if (existing) return existing.id;
  const created = await tx.register.create({ data: { name: name.trim() } });
  return created.id;
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

export async function extractLinguisticKnowledge(
  sentenceId: string,
  opts: { force?: boolean } = {},
): Promise<{ status: "completed" | "skipped" | "no_provider" }> {
  const sentence = await db.sentence.findUnique({
    where: { id: sentenceId },
    include: { dialect: true, language: true },
  });
  if (!sentence) return { status: "skipped" };

  if (!opts.force) {
    const already = await db.enrichmentJob.findFirst({
      where: { type: "extract_linguistics", entityType: "sentence", entityId: sentenceId, status: "COMPLETED" },
    });
    if (already) return { status: "skipped" };
  }

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
      // Populate blank sentence-level fields with AI enrichment — never
      // overwrites a value that's already set (e.g. by a human edit, or a
      // prior enrichment run), so this is purely additive.
      const intentId = data.intent ? await resolveIntent(tx, data.intent) : null;
      const registerId = data.register ? await resolveRegister(tx, data.register) : null;
      const sentenceUpdate: Prisma.SentenceUpdateInput = {};
      if (!sentence.meaning && data.englishMeaning) sentenceUpdate.meaning = data.englishMeaning;
      if (!sentence.intentId && intentId) sentenceUpdate.intent = { connect: { id: intentId } };
      if (!sentence.registerId && registerId) sentenceUpdate.register = { connect: { id: registerId } };
      if (sentence.naturalness === "UNKNOWN" && data.naturalness !== "UNKNOWN") sentenceUpdate.naturalness = data.naturalness;
      if (Object.keys(sentenceUpdate).length > 0) {
        await tx.sentence.update({ where: { id: sentence.id }, data: sentenceUpdate });
      }

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

      // Equivalent-utterance grouping: whole-sentence meaning equivalents
      // (MSA + every enabled translation language) are sentence-level
      // realizations of the same UTTERANCE MEANING, not attributes of some
      // arbitrary lexical Concept — a whole-sentence English gloss must
      // never end up as the "translation" of a single extracted word.
      // Each equivalent becomes its own companion Sentence in the same
      // UtteranceGroup, exactly like the dialect original, so "equivalent
      // utterances are preferred over literal translations" (CLAUDE.md rule
      // 7) stays a queryable structure, not a string field.
      const equivalents: { languageId: string; text: string }[] = [];
      if (data.msaEquivalent && msaLanguage && sentence.language.code !== "ar-MSA") {
        equivalents.push({ languageId: msaLanguage.id, text: data.msaEquivalent });
      }
      for (const t of data.translations) {
        const lang = translationTargets.find((l) => l.code === t.languageCode);
        const text = t.text.trim();
        if (lang && text) equivalents.push({ languageId: lang.id, text });
      }

      if (equivalents.length > 0) {
        let groupId = sentence.utteranceGroupId;
        if (!groupId) {
          const group = await tx.utteranceGroup.create({ data: { name: (data.msaEquivalent ?? data.englishMeaning ?? sentence.textOriginal).slice(0, 120) } });
          groupId = group.id;
          await tx.sentence.update({ where: { id: sentence.id }, data: { utteranceGroupId: groupId } });
        }
        for (const eq of equivalents) {
          const sentenceMatch = await tx.sentence.findFirst({
            where: { textNormalized: normalizeArabic(eq.text), languageId: eq.languageId },
            select: { id: true, utteranceGroupId: true },
          });
          if (sentenceMatch) {
            if (!sentenceMatch.utteranceGroupId) {
              await tx.sentence.update({ where: { id: sentenceMatch.id }, data: { utteranceGroupId: groupId } });
            }
            continue;
          }
          const equivSentence = await tx.sentence.create({
            data: {
              textOriginal: eq.text,
              textNormalized: normalizeArabic(eq.text),
              languageId: eq.languageId,
              meaning: eq.languageId === msaLanguage?.id ? sentence.meaning : null,
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
          await recordRevision(tx, { entityType: "sentence", entityId: equivSentence.id, kind: "CREATE", newValue: equivSentence, reason: "AI linguistic extraction (equivalent utterance)" });
        }
      }
    }, { timeout: 120_000 });

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
