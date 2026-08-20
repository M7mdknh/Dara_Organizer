import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { normalizeArabic } from "@/services/normalization";
import { matchExpression } from "@/services/matching";
import { recordRevision, diffFields } from "@/services/revisions";

export const expressionInputSchema = z.object({
  textOriginal: z.string().min(1),
  languageId: z.string(),
  dialectId: z.string().nullish(),
  type: z
    .enum(["WORD", "PHRASE", "IDIOM", "SLANG", "GREETING", "FORMULA", "FILLER", "DISCOURSE_MARKER", "EXPRESSION"])
    .optional(),
  registerId: z.string().nullish(),
  commonness: z.enum(["VERY_HIGH", "HIGH", "MEDIUM", "LOW", "RARE", "CONTEXTUAL", "UNKNOWN"]).optional(),
  meaningNote: z.string().nullish(),
  usageNote: z.string().nullish(),
  quality: z.enum(["GOLD", "SILVER", "REFERENCE", "CANDIDATE"]).optional(),
  training: z.enum(["ELIGIBLE", "NOT_ELIGIBLE", "UNDECIDED"]).optional(),
  trainingNote: z.string().nullish(),
  sourceId: z.string().nullish(),
  conceptId: z.string().nullish(),
  categoryIds: z.array(z.string()).optional(),
});

export type ExpressionInput = z.infer<typeof expressionInputSchema>;

/**
 * Create an expression through the matching engine. Exact/normalized matches
 * are returned idempotently instead of creating duplicates; semantic overlap
 * with existing expressions of the same concept creates a ReviewItem.
 */
export async function createExpression(input: ExpressionInput, userId: string) {
  return db.$transaction(async (tx) => {
    const match = await matchExpression(tx, {
      textOriginal: input.textOriginal,
      languageId: input.languageId,
      dialectId: input.dialectId ?? null,
      conceptId: input.conceptId ?? null,
    });

    if (match.kind === "exact" || match.kind === "normalized") {
      // Idempotent: link concept if requested and return the existing record.
      if (input.conceptId) {
        await tx.conceptExpression.upsert({
          where: { conceptId_expressionId: { conceptId: input.conceptId, expressionId: match.expressionId } },
          create: { conceptId: input.conceptId, expressionId: match.expressionId },
          update: {},
        });
      }
      const existing = await tx.expression.findUnique({ where: { id: match.expressionId } });
      return { expression: existing!, matched: true as const, review: null };
    }

    const { conceptId, categoryIds, ...fields } = input;
    const created = await tx.expression.create({
      data: {
        ...fields,
        textNormalized: normalizeArabic(input.textOriginal),
        origin: "HUMAN",
        ...(conceptId ? { concepts: { create: { conceptId } } } : {}),
        ...(categoryIds?.length
          ? { categories: { create: categoryIds.map((categoryId) => ({ categoryId })) } }
          : {}),
      },
    });
    await recordRevision(tx, {
      entityType: "expression",
      entityId: created.id,
      kind: "CREATE",
      newValue: created,
      userId,
    });

    let review = null;
    if (match.kind === "semantic_conflict" || match.kind === "dialect_conflict") {
      review = await tx.reviewItem.create({
        data: {
          type: match.kind === "semantic_conflict" ? "SEMANTIC_CONFLICT" : "DIALECT_UNCERTAIN",
          title:
            match.kind === "semantic_conflict"
              ? `New expression "${input.textOriginal}" overlaps existing expressions for the same concept`
              : `"${input.textOriginal}" already exists under a different dialect`,
          payload: {
            candidate: { id: created.id, text: input.textOriginal, dialectId: input.dialectId ?? null },
            competing:
              match.kind === "semantic_conflict" ? match.competingExpressionIds : [match.expressionId],
            conceptId: input.conceptId ?? null,
          } as Prisma.InputJsonValue,
          entityType: "expression",
          entityId: created.id,
          candidateEntityId:
            match.kind === "semantic_conflict" ? match.competingExpressionIds[0] : match.expressionId,
        },
      });
    }
    return { expression: created, matched: false as const, review };
  });
}

export async function updateExpression(
  id: string,
  data: Partial<ExpressionInput>,
  userId: string,
  reason?: string,
) {
  return db.$transaction(async (tx) => {
    const before = await tx.expression.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, "Expression not found");

    const { conceptId, categoryIds, ...fields } = data;
    const updateData: Prisma.ExpressionUpdateInput = { ...fields };
    if (fields.textOriginal) {
      updateData.textNormalized = normalizeArabic(fields.textOriginal);
    }
    const updated = await tx.expression.update({ where: { id }, data: updateData });
    if (categoryIds) {
      await tx.expressionCategory.deleteMany({ where: { expressionId: id } });
      if (categoryIds.length) {
        await tx.expressionCategory.createMany({
          data: categoryIds.map((categoryId) => ({ expressionId: id, categoryId })),
        });
      }
    }
    if (conceptId) {
      await tx.conceptExpression.upsert({
        where: { conceptId_expressionId: { conceptId, expressionId: id } },
        create: { conceptId, expressionId: id },
        update: {},
      });
    }
    const { oldDiff, newDiff } = diffFields(
      before as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    );
    if (Object.keys(newDiff).length > 0) {
      await recordRevision(tx, {
        entityType: "expression",
        entityId: id,
        kind: "UPDATE",
        oldValue: oldDiff,
        newValue: newDiff,
        userId,
        reason,
      });
    }
    return updated;
  });
}

export async function addExpressionRelation(
  fromId: string,
  toId: string,
  type: string,
  notes: string | null,
  userId: string,
) {
  if (fromId === toId) throw new ApiError(400, "An expression cannot relate to itself");
  const relation = await db.expressionRelation.upsert({
    where: {
      fromId_toId_type: {
        fromId,
        toId,
        type: type as never,
      },
    },
    create: { fromId, toId, type: type as never, notes },
    update: { notes },
  });
  await recordRevision(db, {
    entityType: "expression",
    entityId: fromId,
    kind: "UPDATE",
    newValue: { relationAdded: { toId, type, notes } },
    userId,
  });
  return relation;
}
