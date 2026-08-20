import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { resolveEmbeddingProvider } from "@/services/ai/enrichment";
import { isEmbeddingProvider } from "@/services/ai/provider";

/**
 * Embedding lifecycle: build a deterministic textual representation of a
 * Concept/Sentence/Expression, hash it, and only regenerate the stored
 * vector when the hash changes. This keeps re-saves of unrelated fields
 * from burning embedding-API calls, and gives an explicit signal
 * ("stale") for anything that still needs a refresh.
 *
 * Representation strategy is versioned (REPRESENTATION_VERSION) — bump it
 * whenever buildXRepresentation changes shape, so a maintenance backfill
 * can find and rebuild every embedding built under an old strategy.
 */

export const REPRESENTATION_VERSION = 1;

export type EmbeddingEntityType = "CONCEPT" | "SENTENCE" | "EXPRESSION";

export function sourceHash(text: string): string {
  return createHash("sha256").update(`v${REPRESENTATION_VERSION}:${text}`).digest("hex");
}

function vectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

/**
 * Concept representation includes the gloss plus every known realization
 * grouped by dialect/language — not just the concept id — so the embedding
 * carries real linguistic evidence (see CLAUDE.md §18).
 */
export async function buildConceptRepresentation(conceptId: string): Promise<string | null> {
  const concept = await db.concept.findUnique({
    where: { id: conceptId },
    include: {
      expressions: {
        include: { expression: { include: { dialect: true, language: true } } },
      },
    },
  });
  if (!concept) return null;

  const lines = [`Concept: ${concept.key}`, `Meaning: ${concept.gloss}`];
  if (concept.description) lines.push(`Description: ${concept.description}`);

  const byGroup = new Map<string, string[]>();
  for (const ce of concept.expressions) {
    const label = ce.expression.dialect?.name ?? ce.expression.language.name;
    if (!byGroup.has(label)) byGroup.set(label, []);
    byGroup.get(label)!.push(ce.expression.textOriginal);
  }
  for (const [label, texts] of byGroup) {
    lines.push(`${label}: ${texts.join(", ")}`);
  }
  return lines.join("\n");
}

/**
 * Sentence representation is the natural utterance plus light, useful
 * context (dialect, meaning gloss) — not metadata stuffing.
 */
export async function buildSentenceRepresentation(sentenceId: string): Promise<string | null> {
  const sentence = await db.sentence.findUnique({
    where: { id: sentenceId },
    include: { dialect: true, language: true, intent: true },
  });
  if (!sentence) return null;
  const lines = [sentence.textOriginal];
  if (sentence.meaning) lines.push(`Meaning: ${sentence.meaning}`);
  const dialect = sentence.dialect?.name ?? sentence.language.name;
  lines.push(`Dialect: ${dialect}`);
  if (sentence.intent) lines.push(`Intent: ${sentence.intent.name}`);
  return lines.join("\n");
}

export async function buildExpressionRepresentation(expressionId: string): Promise<string | null> {
  const expression = await db.expression.findUnique({
    where: { id: expressionId },
    include: { dialect: true, language: true, concepts: { include: { concept: true } } },
  });
  if (!expression) return null;
  const lines = [expression.textOriginal];
  const dialect = expression.dialect?.name ?? expression.language.name;
  lines.push(`Dialect: ${dialect}`);
  if (expression.meaningNote) lines.push(`Meaning: ${expression.meaningNote}`);
  for (const ce of expression.concepts) lines.push(`Concept: ${ce.concept.key} (${ce.concept.gloss})`);
  return lines.join("\n");
}

async function buildRepresentation(entityType: EmbeddingEntityType, entityId: string): Promise<string | null> {
  switch (entityType) {
    case "CONCEPT":
      return buildConceptRepresentation(entityId);
    case "SENTENCE":
      return buildSentenceRepresentation(entityId);
    case "EXPRESSION":
      return buildExpressionRepresentation(entityId);
  }
}

interface ExistingEmbeddingRow {
  sourceHash: string;
}

/**
 * Ensure the given entity has a current embedding. No-op (fast path) when
 * the freshly-built representation hashes the same as what's stored.
 * Returns "unchanged" | "generated" | "skipped_no_provider" | "deleted_source".
 */
export async function ensureEmbedding(
  entityType: EmbeddingEntityType,
  entityId: string,
): Promise<"unchanged" | "generated" | "skipped_no_provider" | "deleted_source"> {
  const representation = await buildRepresentation(entityType, entityId);
  if (representation === null) {
    // Source entity was deleted; drop any embedding we had for it.
    await db.$executeRaw`DELETE FROM "Embedding" WHERE "entityType" = ${entityType}::"EmbeddingEntityType" AND "entityId" = ${entityId}`;
    return "deleted_source";
  }

  const hash = sourceHash(representation);
  const existing = await db.$queryRaw<ExistingEmbeddingRow[]>`
    SELECT "sourceHash" FROM "Embedding" WHERE "entityType" = ${entityType}::"EmbeddingEntityType" AND "entityId" = ${entityId} LIMIT 1
  `;
  if (existing.length && existing[0].sourceHash === hash) return "unchanged";

  const provider = await resolveEmbeddingProvider();
  if (!provider || !isEmbeddingProvider(provider)) {
    // Mark stale so a maintenance backfill picks it up once a provider is configured.
    await db.$executeRaw`
      UPDATE "Embedding" SET stale = true, "updatedAt" = now()
      WHERE "entityType" = ${entityType}::"EmbeddingEntityType" AND "entityId" = ${entityId}
    `;
    return "skipped_no_provider";
  }

  const result = await provider.embed([representation]);
  const vector = result.vectors[0];
  const id = `${entityType.toLowerCase()}_${entityId}`;
  await db.$executeRaw`
    INSERT INTO "Embedding" (id, "entityType", "entityId", provider, model, dimensions, "sourceText", "sourceHash", vector, stale, "generatedAt", "updatedAt")
    VALUES (${id}, ${entityType}::"EmbeddingEntityType", ${entityId}, ${provider.name}, ${result.model}, ${result.dimensions}, ${representation}, ${hash}, ${vectorLiteral(vector)}::vector, false, now(), now())
    ON CONFLICT ("entityType", "entityId") DO UPDATE SET
      provider = EXCLUDED.provider,
      model = EXCLUDED.model,
      dimensions = EXCLUDED.dimensions,
      "sourceText" = EXCLUDED."sourceText",
      "sourceHash" = EXCLUDED."sourceHash",
      vector = EXCLUDED.vector,
      stale = false,
      "generatedAt" = now(),
      "updatedAt" = now()
  `;
  return "generated";
}

export interface EmbeddingCandidate {
  entityId: string;
  similarity: number;
}

/** Exact KNN candidate retrieval (see migration note on ANN index dimension limits). */
export async function retrieveCandidates(
  entityType: EmbeddingEntityType,
  queryVector: number[],
  topK: number,
  minSimilarity: number,
): Promise<EmbeddingCandidate[]> {
  const literal = vectorLiteral(queryVector);
  const rows = await db.$queryRaw<{ entityId: string; similarity: number }[]>`
    SELECT "entityId", 1 - (vector <=> ${literal}::vector) AS similarity
    FROM "Embedding"
    WHERE "entityType" = ${entityType}::"EmbeddingEntityType"
    ORDER BY vector <=> ${literal}::vector
    LIMIT ${topK}
  `;
  return rows.filter((r) => r.similarity >= minSimilarity);
}

/** Embed arbitrary free text (e.g. a new import row before it becomes a record) for candidate lookup. */
export async function embedQueryText(text: string): Promise<number[] | null> {
  const provider = await resolveEmbeddingProvider();
  if (!provider || !isEmbeddingProvider(provider)) return null;
  const result = await provider.embed([text]);
  return result.vectors[0] ?? null;
}

export interface EmbeddingStatusRow {
  entityType: EmbeddingEntityType;
  entityId: string;
  stale: boolean;
  generatedAt: Date;
}

export async function listStaleEmbeddings(limit = 200): Promise<EmbeddingStatusRow[]> {
  return db.$queryRaw<EmbeddingStatusRow[]>`
    SELECT "entityType", "entityId", stale, "generatedAt" FROM "Embedding" WHERE stale = true ORDER BY "generatedAt" ASC LIMIT ${limit}
  `;
}

/** Finds entities of a given type that have no embedding row at all yet. */
export async function findMissingEmbeddings(entityType: EmbeddingEntityType, limit = 500): Promise<string[]> {
  if (entityType === "CONCEPT") {
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT c.id FROM "Concept" c
      LEFT JOIN "Embedding" e ON e."entityType" = 'CONCEPT' AND e."entityId" = c.id
      WHERE e.id IS NULL LIMIT ${limit}
    `;
    return rows.map((r) => r.id);
  }
  if (entityType === "SENTENCE") {
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT s.id FROM "Sentence" s
      LEFT JOIN "Embedding" e ON e."entityType" = 'SENTENCE' AND e."entityId" = s.id
      WHERE e.id IS NULL AND s.status = 'ACTIVE' LIMIT ${limit}
    `;
    return rows.map((r) => r.id);
  }
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT ex.id FROM "Expression" ex
    LEFT JOIN "Embedding" e ON e."entityType" = 'EXPRESSION' AND e."entityId" = ex.id
    WHERE e.id IS NULL AND ex.status = 'ACTIVE' LIMIT ${limit}
  `;
  return rows.map((r) => r.id);
}
