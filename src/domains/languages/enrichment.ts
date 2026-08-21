import { z } from "zod";
import { db } from "@/lib/db";
import { normalizeArabic } from "@/services/normalization";
import { matchExpression } from "@/services/matching";
import { resolveProvider } from "@/services/ai/enrichment";
import { recordRevision } from "@/services/revisions";

/**
 * New-language enrichment: backfills translations for existing Concepts
 * into a newly enabled (or newly selected) language. This is the workflow
 * that makes the Concept-as-semantic-hub design pay off — adding a language
 * later re-enriches everything that already exists instead of requiring a
 * re-import (CLAUDE.md rule: concepts are semantic anchors).
 *
 * Batches many concepts into a single structured-output call (cost
 * control) rather than one AI call per concept. Every created translation
 * is Origin=AI / quality=SILVER / provenance-tagged, and reuse-before-create
 * still applies at the expression level via matchExpression (a translation
 * the AI proposes that already exists verbatim is linked, not duplicated).
 */

const BATCH_SIZE = 25;

const TranslationBatchSchema = z.object({
  translations: z.array(
    z.object({
      conceptKey: z.string(),
      text: z.string(),
    }),
  ),
});

const TRANSLATION_BATCH_JSON_SCHEMA = {
  name: "concept_translations",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      translations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            conceptKey: { type: "string", description: "Must exactly match one of the given concept keys." },
            text: { type: "string", description: "A natural equivalent (not a literal word-for-word translation) in the target language." },
          },
          required: ["conceptKey", "text"],
        },
      },
    },
    required: ["translations"],
  },
};

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export interface LanguageEnrichmentResult {
  languageId: string;
  requested: number;
  created: number;
  skipped: number;
}

export async function enrichConceptsForLanguage(
  languageId: string,
  opts: { onlyVerified?: boolean; limit?: number } = {},
): Promise<LanguageEnrichmentResult> {
  const language = await db.language.findUnique({ where: { id: languageId } });
  if (!language) throw new Error("Language not found");

  const provider = await resolveProvider();
  if (!provider) throw new Error("No AI provider configured. Set the provider in Settings → AI.");

  // Concepts that don't yet have any expression linked under this language.
  const candidateConcepts = await db.concept.findMany({
    where: {
      expressions: { none: { expression: { languageId } } },
      ...(opts.onlyVerified
        ? { expressions: { some: { expression: { verification: "VERIFIED" } } } }
        : {}),
    },
    select: { id: true, key: true, gloss: true, canonicalMsa: true },
    take: opts.limit ?? 500,
  });

  let created = 0;
  let skipped = 0;

  for (let i = 0; i < candidateConcepts.length; i += BATCH_SIZE) {
    const batch = candidateConcepts.slice(i, i + BATCH_SIZE);
    const prompt = [
      `Provide natural (not literal word-for-word) ${language.name} equivalents for these concepts.`,
      ...batch.map((c) => `- ${c.key}: ${c.gloss}${c.canonicalMsa ? ` (MSA: ${c.canonicalMsa})` : ""}`),
    ].join("\n");

    let result;
    try {
      result = await provider.complete({
        system: `You are a professional ${language.name} translator working on a linguistic training-data platform. Never fabricate a translation you're not confident about — omit it instead.`,
        prompt,
        jsonSchema: TRANSLATION_BATCH_JSON_SCHEMA,
        reasoningEffort: "low",
      });
    } catch {
      skipped += batch.length;
      continue;
    }

    const raw = result.json ?? safeParseJson(result.text);
    const parsed = TranslationBatchSchema.safeParse(raw);
    if (!parsed.success) {
      skipped += batch.length;
      continue;
    }

    const byKey = new Map(batch.map((c) => [c.key, c]));
    for (const t of parsed.data.translations) {
      const concept = byKey.get(t.conceptKey);
      const text = t.text.trim();
      if (!concept || !text) {
        skipped++;
        continue;
      }
      const match = await matchExpression(db, { textOriginal: text, languageId, conceptId: concept.id });
      let expressionId: string | null = null;
      if (match.kind === "exact" || match.kind === "normalized") {
        expressionId = match.expressionId;
      } else if (match.kind === "new") {
        const expr = await db.expression.create({
          data: {
            textOriginal: text,
            textNormalized: normalizeArabic(text),
            languageId,
            quality: "SILVER",
            verification: "UNVERIFIED",
            origin: "AI",
            aiProvider: provider.name,
            aiModel: provider.model,
            aiGeneratedAt: new Date(),
          },
        });
        await recordRevision(db, { entityType: "expression", entityId: expr.id, kind: "CREATE", newValue: expr, reason: `AI language enrichment (${language.name})` });
        expressionId = expr.id;
      } else {
        skipped++;
        continue;
      }
      await db.conceptExpression.upsert({
        where: { conceptId_expressionId: { conceptId: concept.id, expressionId } },
        update: {},
        create: { conceptId: concept.id, expressionId, isPrimary: false },
      });
      created++;
    }
  }

  return { languageId, requested: candidateConcepts.length, created, skipped };
}
