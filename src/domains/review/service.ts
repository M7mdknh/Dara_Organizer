import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { normalizeArabic } from "@/services/normalization";
import { recordRevision } from "@/services/revisions";

export const resolveSchema = z.object({
  resolution: z.enum([
    "APPROVED",
    "ADDED_SYNONYM",
    "ADDED_VARIANT",
    "ADDED_DIALECT_EQUIVALENT",
    "ADDED_TO_CONCEPT",
    "DIFFERENT_MEANING",
    "DIFFERENT_DIALECT",
    "REPLACED",
    "EDITED",
    "REJECTED",
    "DISMISSED",
  ]),
  note: z.string().nullish(),
  // action-specific inputs
  targetExpressionId: z.string().nullish(), // competing expression the action relates to
  targetConceptId: z.string().nullish(), // for ADDED_TO_CONCEPT (AI-suggested semantic match)
  newDialectId: z.string().nullish(), // for DIFFERENT_DIALECT
  editedText: z.string().nullish(), // for EDITED
  rejectionReason: z
    .enum(["UNNATURAL", "TOO_FORMAL", "SOUNDS_MSA", "WRONG_DIALECT", "WRONG_CONTEXT", "OUTDATED", "INCORRECT", "POOR_TRANSLATION", "OTHER"])
    .nullish(),
});

export type ResolveInput = z.infer<typeof resolveSchema>;

/**
 * Resolve a review item. Every path records the decision on the item and a
 * revision on the affected entity; nothing is silently destroyed.
 */
export async function resolveReviewItem(itemId: string, input: ResolveInput, userId: string) {
  const item = await db.reviewItem.findUnique({ where: { id: itemId } });
  if (!item) throw new ApiError(404, "Review item not found");
  if (item.status !== "PENDING") throw new ApiError(400, "Review item is already resolved");

  const payload = (item.payload ?? {}) as { candidate?: { id?: string }; competing?: string[] };
  const candidateId = item.entityId ?? payload.candidate?.id ?? null;
  const competingId = input.targetExpressionId ?? item.candidateEntityId ?? payload.competing?.[0] ?? null;

  await db.$transaction(async (tx) => {
    const relate = async (type: string) => {
      if (!candidateId || !competingId) throw new ApiError(400, "This action needs a candidate and a target expression");
      await tx.expressionRelation.upsert({
        where: { fromId_toId_type: { fromId: candidateId, toId: competingId, type: type as never } },
        create: { fromId: candidateId, toId: competingId, type: type as never, notes: input.note ?? null },
        update: {},
      });
      await recordRevision(tx, {
        entityType: "expression",
        entityId: candidateId,
        kind: "UPDATE",
        newValue: { reviewRelation: { toId: competingId, type } },
        userId,
        reason: `Review: ${input.resolution}`,
      });
    };

    switch (input.resolution) {
      case "APPROVED":
        if (item.type === "RESPONSE_PATTERN") {
          // Accepting a proposed trigger/response pair (see
          // src/domains/imports/conversation-extraction.ts) creates the
          // actual conversational-response records — never fabricated
          // automatically, only on explicit human confirmation.
          const rp = (item.payload ?? {}) as {
            trigger?: { text?: string; sentenceId?: string };
            response?: { text?: string; sentenceId?: string };
            dialectId?: string | null;
          };
          if (!rp.trigger?.text || !rp.response?.text) throw new ApiError(400, "Missing trigger/response text");
          const pattern = await tx.responsePattern.create({ data: { name: `Response to "${rp.trigger.text}"` } });
          await tx.responseTrigger.create({
            data: {
              patternId: pattern.id,
              textOriginal: rp.trigger.text,
              textNormalized: normalizeArabic(rp.trigger.text),
              dialectId: rp.dialectId ?? null,
              sentenceId: rp.trigger.sentenceId ?? null,
              origin: "IMPORT",
            },
          });
          await tx.responseVariant.create({
            data: {
              patternId: pattern.id,
              textOriginal: rp.response.text,
              textNormalized: normalizeArabic(rp.response.text),
              dialectId: rp.dialectId ?? null,
              sentenceId: rp.response.sentenceId ?? null,
              origin: "IMPORT",
              quality: "CANDIDATE",
            },
          });
          await recordRevision(tx, { entityType: "responsePattern", entityId: pattern.id, kind: "CREATE", newValue: pattern, userId, reason: "Review: response pattern accepted" });
        }
        break; // keep candidate as-is
      case "ADDED_SYNONYM":
        await relate("SYNONYM");
        break;
      case "ADDED_VARIANT":
        await relate("REGIONAL_VARIANT");
        break;
      case "ADDED_DIALECT_EQUIVALENT":
        await relate("DIALECT_EQUIVALENT");
        break;
      case "ADDED_TO_CONCEPT": {
        // Links an AI-suggested semantic-candidate expression to the
        // concept a human confirmed. Never automatic — always a review
        // decision, regardless of vector similarity/model confidence.
        if (!candidateId) throw new ApiError(400, "Missing candidate");
        const conceptId = input.targetConceptId;
        if (!conceptId) throw new ApiError(400, "targetConceptId is required");
        await tx.conceptExpression.upsert({
          where: { conceptId_expressionId: { conceptId, expressionId: candidateId } },
          create: { conceptId, expressionId: candidateId },
          update: {},
        });
        await recordRevision(tx, {
          entityType: "expression",
          entityId: candidateId,
          kind: "UPDATE",
          newValue: { conceptLinked: conceptId },
          userId,
          reason: "Review: AI-suggested concept match confirmed",
        });
        break;
      }
      case "DIFFERENT_MEANING": {
        // The candidate does NOT share the concept it was matched against.
        if (!candidateId) throw new ApiError(400, "Missing candidate");
        const conceptId = (payload as { conceptId?: string }).conceptId;
        if (conceptId) {
          await tx.conceptExpression.deleteMany({ where: { conceptId, expressionId: candidateId } });
          await recordRevision(tx, {
            entityType: "expression",
            entityId: candidateId,
            kind: "UPDATE",
            oldValue: { conceptId },
            newValue: { conceptDetached: conceptId },
            userId,
            reason: "Review: different meaning",
          });
        }
        break;
      }
      case "DIFFERENT_DIALECT": {
        if (!candidateId || !input.newDialectId) throw new ApiError(400, "newDialectId is required");
        const before = await tx.expression.findUnique({ where: { id: candidateId } });
        if (!before) throw new ApiError(404, "Candidate expression not found");
        await tx.expression.update({ where: { id: candidateId }, data: { dialectId: input.newDialectId } });
        await recordRevision(tx, {
          entityType: "expression",
          entityId: candidateId,
          kind: "UPDATE",
          oldValue: { dialectId: before.dialectId },
          newValue: { dialectId: input.newDialectId },
          userId,
          reason: "Review: different dialect",
        });
        break;
      }
      case "REPLACED": {
        // Candidate replaces the competing expression: competing is rejected, not deleted.
        if (!competingId) throw new ApiError(400, "Missing target expression");
        const before = await tx.expression.findUnique({ where: { id: competingId } });
        if (!before) throw new ApiError(404, "Target expression not found");
        await tx.expression.update({
          where: { id: competingId },
          data: { status: "REJECTED", rejectionReason: input.rejectionReason ?? "OTHER", rejectionNote: input.note ?? "Replaced during review" },
        });
        await recordRevision(tx, {
          entityType: "expression",
          entityId: competingId,
          kind: "UPDATE",
          oldValue: { status: before.status },
          newValue: { status: "REJECTED", replacedBy: candidateId },
          userId,
          reason: "Review: replaced",
        });
        break;
      }
      case "EDITED": {
        if (!candidateId || !input.editedText) throw new ApiError(400, "editedText is required");
        const before = await tx.expression.findUnique({ where: { id: candidateId } });
        if (!before) throw new ApiError(404, "Candidate expression not found");
        await tx.expression.update({
          where: { id: candidateId },
          data: { textOriginal: input.editedText, textNormalized: normalizeArabic(input.editedText) },
        });
        await recordRevision(tx, {
          entityType: "expression",
          entityId: candidateId,
          kind: "UPDATE",
          oldValue: { textOriginal: before.textOriginal },
          newValue: { textOriginal: input.editedText },
          userId,
          reason: "Review: edited",
        });
        break;
      }
      case "REJECTED": {
        if (!candidateId) throw new ApiError(400, "Missing candidate");
        const before = await tx.expression.findUnique({ where: { id: candidateId } });
        if (before) {
          await tx.expression.update({
            where: { id: candidateId },
            data: { status: "REJECTED", rejectionReason: input.rejectionReason ?? "OTHER", rejectionNote: input.note ?? null },
          });
          await recordRevision(tx, {
            entityType: "expression",
            entityId: candidateId,
            kind: "UPDATE",
            oldValue: { status: before.status },
            newValue: { status: "REJECTED", reason: input.rejectionReason ?? "OTHER" },
            userId,
            reason: "Review: rejected",
          });
        }
        break;
      }
      case "DISMISSED":
        break;
    }

    await tx.reviewItem.update({
      where: { id: itemId },
      data: {
        status: input.resolution === "DISMISSED" ? "DISMISSED" : "RESOLVED",
        resolution: input.resolution,
        resolutionNote: input.note ?? null,
        resolvedById: userId,
        resolvedAt: new Date(),
      },
    });
  });

  return db.reviewItem.findUnique({ where: { id: itemId } });
}
