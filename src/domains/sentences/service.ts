import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { normalizeArabic } from "@/services/normalization";
import { matchSentence } from "@/services/matching";
import { recordRevision, diffFields } from "@/services/revisions";

export const sentenceInputSchema = z.object({
  textOriginal: z.string().min(1),
  languageId: z.string(),
  dialectId: z.string().nullish(),
  meaning: z.string().nullish(),
  literalNote: z.string().nullish(),
  utteranceGroupId: z.string().nullish(),
  intentId: z.string().nullish(),
  situationId: z.string().nullish(),
  registerId: z.string().nullish(),
  functionId: z.string().nullish(),
  naturalness: z.enum(["NATURAL", "ACCEPTABLE", "UNNATURAL", "UNKNOWN"]).optional(),
  commonness: z.enum(["VERY_HIGH", "HIGH", "MEDIUM", "LOW", "RARE", "CONTEXTUAL", "UNKNOWN"]).optional(),
  isCorrect: z.boolean().nullish(),
  dialectConfidence: z.enum(["HIGH", "MEDIUM", "LOW"]).nullish(),
  quality: z.enum(["GOLD", "SILVER", "REFERENCE", "CANDIDATE"]).optional(),
  training: z.enum(["ELIGIBLE", "NOT_ELIGIBLE", "UNDECIDED"]).optional(),
  trainingNote: z.string().nullish(),
  sourceId: z.string().nullish(),
  conceptIds: z.array(z.string()).optional(),
  expressionIds: z.array(z.string()).optional(),
  categoryIds: z.array(z.string()).optional(),
  topicIds: z.array(z.string()).optional(),
});

export type SentenceInput = z.infer<typeof sentenceInputSchema>;

export async function createSentence(input: SentenceInput, userId: string) {
  return db.$transaction(async (tx) => {
    const match = await matchSentence(tx, {
      textOriginal: input.textOriginal,
      languageId: input.languageId,
      dialectId: input.dialectId ?? null,
    });
    if (match.kind === "exact" || match.kind === "normalized") {
      const existing = await tx.sentence.findUnique({ where: { id: match.sentenceId } });
      return { sentence: existing!, matched: true as const };
    }

    const { conceptIds, expressionIds, categoryIds, topicIds, ...fields } = input;
    const created = await tx.sentence.create({
      data: {
        ...fields,
        textNormalized: normalizeArabic(input.textOriginal),
        origin: "HUMAN",
        ...(conceptIds?.length ? { concepts: { create: conceptIds.map((conceptId) => ({ conceptId })) } } : {}),
        ...(expressionIds?.length
          ? { expressions: { create: expressionIds.map((expressionId) => ({ expressionId })) } }
          : {}),
        ...(categoryIds?.length
          ? { categories: { create: categoryIds.map((categoryId) => ({ categoryId })) } }
          : {}),
        ...(topicIds?.length ? { topics: { create: topicIds.map((topicId) => ({ topicId })) } } : {}),
      },
    });
    await recordRevision(tx, { entityType: "sentence", entityId: created.id, kind: "CREATE", newValue: created, userId });
    return { sentence: created, matched: false as const };
  });
}

export async function updateSentence(id: string, data: Partial<SentenceInput> & { verification?: string; status?: string; rejectionReason?: string | null; rejectionNote?: string | null; verifiedById?: string | null; verifiedAt?: Date | null }, userId: string, reason?: string) {
  return db.$transaction(async (tx) => {
    const before = await tx.sentence.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, "Sentence not found");
    const { conceptIds, expressionIds, categoryIds, topicIds, ...fields } = data;
    const updateData: Record<string, unknown> = { ...fields };
    if (typeof fields.textOriginal === "string") {
      updateData.textNormalized = normalizeArabic(fields.textOriginal);
    }
    const updated = await tx.sentence.update({ where: { id }, data: updateData as Prisma.SentenceUpdateInput });

    if (categoryIds) {
      await tx.sentenceCategory.deleteMany({ where: { sentenceId: id } });
      if (categoryIds.length)
        await tx.sentenceCategory.createMany({ data: categoryIds.map((categoryId) => ({ sentenceId: id, categoryId })) });
    }
    if (topicIds) {
      await tx.sentenceTopic.deleteMany({ where: { sentenceId: id } });
      if (topicIds.length)
        await tx.sentenceTopic.createMany({ data: topicIds.map((topicId) => ({ sentenceId: id, topicId })) });
    }
    if (conceptIds) {
      await tx.sentenceConcept.deleteMany({ where: { sentenceId: id } });
      if (conceptIds.length)
        await tx.sentenceConcept.createMany({ data: conceptIds.map((conceptId) => ({ sentenceId: id, conceptId })) });
    }
    if (expressionIds) {
      await tx.sentenceExpression.deleteMany({ where: { sentenceId: id } });
      if (expressionIds.length)
        await tx.sentenceExpression.createMany({
          data: expressionIds.map((expressionId) => ({ sentenceId: id, expressionId })),
        });
    }

    const { oldDiff, newDiff } = diffFields(before as never, updated as never);
    if (Object.keys(newDiff).length) {
      await recordRevision(tx, { entityType: "sentence", entityId: id, kind: "UPDATE", oldValue: oldDiff, newValue: newDiff, userId, reason });
    }
    return updated;
  });
}
