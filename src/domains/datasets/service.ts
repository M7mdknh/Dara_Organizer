import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { dialectWithDescendants } from "@/services/dialectTree";

/**
 * Dataset builds are reproducible snapshots. Filters + split strategy + seed
 * fully determine membership; included record ids are materialized so the
 * exact dataset can be re-exported later even as the corpus grows.
 *
 * Leakage protection: sentences that belong to the same equivalent-utterance
 * group are one "family" and are always assigned to the same split.
 */

export const datasetFiltersSchema = z.object({
  entity: z.enum(["sentence", "conversation"]).default("sentence"),
  dialectId: z.string().nullish(),
  languageId: z.string().nullish(),
  quality: z.array(z.enum(["GOLD", "SILVER", "REFERENCE", "CANDIDATE"])).optional(),
  verification: z.enum(["VERIFIED", "UNVERIFIED"]).nullish(),
  training: z.enum(["ELIGIBLE", "NOT_ELIGIBLE", "UNDECIDED"]).nullish(),
  naturalness: z.array(z.enum(["NATURAL", "ACCEPTABLE", "UNNATURAL", "UNKNOWN"])).optional(),
  categoryId: z.string().nullish(),
  intentId: z.string().nullish(),
  situationId: z.string().nullish(),
  sourceId: z.string().nullish(),
  collectionId: z.string().nullish(),
  hasPronunciation: z.boolean().nullish(),
});

export const splitStrategySchema = z.object({
  train: z.number().min(0).max(1),
  validation: z.number().min(0).max(1),
  test: z.number().min(0).max(1),
  seed: z.number().int().default(42),
  groupBy: z.enum(["utteranceGroup", "none"]).default("utteranceGroup"),
});

export type DatasetFilters = z.infer<typeof datasetFiltersSchema>;
export type SplitStrategy = z.infer<typeof splitStrategySchema>;

/** Deterministic 32-bit FNV-1a hash for reproducible shuffling. */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Assign families to splits deterministically: order families by
 * hash(groupKey + seed), then fill train/validation/test by fraction.
 */
export function assignSplits(
  families: { groupKey: string; memberIds: string[] }[],
  strategy: SplitStrategy,
): Map<string, "TRAIN" | "VALIDATION" | "TEST"> {
  const total = strategy.train + strategy.validation + strategy.test;
  if (total <= 0) throw new ApiError(400, "Split fractions must sum to a positive value");
  const sorted = [...families].sort(
    (a, b) => fnv1a(`${a.groupKey}:${strategy.seed}`) - fnv1a(`${b.groupKey}:${strategy.seed}`),
  );
  const totalMembers = sorted.reduce((n, f) => n + f.memberIds.length, 0);
  const trainTarget = (strategy.train / total) * totalMembers;
  const valTarget = (strategy.validation / total) * totalMembers;

  const result = new Map<string, "TRAIN" | "VALIDATION" | "TEST">();
  let assigned = 0;
  for (const family of sorted) {
    let split: "TRAIN" | "VALIDATION" | "TEST";
    if (assigned < trainTarget) split = "TRAIN";
    else if (assigned < trainTarget + valTarget) split = "VALIDATION";
    else split = "TEST";
    for (const id of family.memberIds) result.set(id, split);
    assigned += family.memberIds.length;
  }
  return result;
}

export async function queryDatasetSentences(filters: DatasetFilters) {
  const where: Prisma.SentenceWhereInput = { status: "ACTIVE" };
  if (filters.dialectId) where.dialectId = { in: await dialectWithDescendants(filters.dialectId) };
  if (filters.languageId) where.languageId = filters.languageId;
  if (filters.quality?.length) where.quality = { in: filters.quality };
  if (filters.verification) where.verification = filters.verification;
  if (filters.training) where.training = filters.training;
  if (filters.naturalness?.length) where.naturalness = { in: filters.naturalness };
  if (filters.categoryId) where.categories = { some: { categoryId: filters.categoryId } };
  if (filters.intentId) where.intentId = filters.intentId;
  if (filters.situationId) where.situationId = filters.situationId;
  if (filters.sourceId) where.sourceId = filters.sourceId;
  if (filters.hasPronunciation === true) where.pronunciations = { some: {} };
  if (filters.collectionId) {
    const items = await db.collectionItem.findMany({
      where: { collectionId: filters.collectionId, entityType: "sentence" },
      select: { entityId: true },
    });
    where.id = { in: items.map((i) => i.entityId) };
  }
  return db.sentence.findMany({
    where,
    select: { id: true, utteranceGroupId: true, textNormalized: true },
  });
}

export async function buildDataset(
  params: {
    name: string;
    description?: string | null;
    filters: DatasetFilters;
    splitStrategy: SplitStrategy;
    exportSchema?: string;
  },
  userId: string,
) {
  const latest = await db.datasetVersion.findFirst({
    where: { name: params.name },
    orderBy: { version: "desc" },
  });
  const version = (latest?.version ?? 0) + 1;

  let families: { groupKey: string; memberIds: string[] }[] = [];
  let memberCount = 0;

  if (params.filters.entity === "sentence") {
    const sentences = await queryDatasetSentences(params.filters);
    memberCount = sentences.length;
    if (params.splitStrategy.groupBy === "utteranceGroup") {
      const map = new Map<string, string[]>();
      for (const s of sentences) {
        // family = utterance group; sentences with identical normalized text also stay together
        const key = s.utteranceGroupId ?? `text:${s.textNormalized}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(s.id);
      }
      families = [...map.entries()].map(([groupKey, memberIds]) => ({ groupKey, memberIds }));
    } else {
      families = sentences.map((s) => ({ groupKey: s.id, memberIds: [s.id] }));
    }
  } else {
    const where: Prisma.ConversationWhereInput = {};
    if (params.filters.dialectId) where.dialectId = { in: await dialectWithDescendants(params.filters.dialectId) };
    if (params.filters.quality?.length) where.quality = { in: params.filters.quality };
    if (params.filters.verification) where.verification = params.filters.verification;
    if (params.filters.training) where.training = params.filters.training;
    const conversations = await db.conversation.findMany({ where, select: { id: true } });
    memberCount = conversations.length;
    families = conversations.map((c) => ({ groupKey: c.id, memberIds: [c.id] }));
  }

  if (memberCount === 0) throw new ApiError(400, "No records match these filters");

  const splits = assignSplits(families, params.splitStrategy);
  const counts = { TRAIN: 0, VALIDATION: 0, TEST: 0 } as Record<string, number>;
  for (const split of splits.values()) counts[split]++;

  const dataset = await db.$transaction(async (tx) => {
    const created = await tx.datasetVersion.create({
      data: {
        name: params.name,
        version,
        description: params.description ?? null,
        filters: params.filters as Prisma.InputJsonValue,
        splitStrategy: params.splitStrategy as Prisma.InputJsonValue,
        counts: counts as Prisma.InputJsonValue,
        exportSchema: params.exportSchema ?? "standard",
        status: "BUILT",
        createdById: userId,
        builtAt: new Date(),
      },
    });
    const entityType = params.filters.entity;
    const groupKeyById = new Map<string, string>();
    for (const f of families) for (const id of f.memberIds) groupKeyById.set(id, f.groupKey);
    const records = [...splits.entries()].map(([entityId, split]) => ({
      datasetId: created.id,
      entityType,
      entityId,
      split,
      groupKey: groupKeyById.get(entityId) ?? null,
    }));
    for (let i = 0; i < records.length; i += 1000) {
      await tx.datasetRecord.createMany({ data: records.slice(i, i + 1000) });
    }
    return created;
  });

  return dataset;
}
