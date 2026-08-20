import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, parseBody, ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { normalizeArabic } from "@/services/normalization";
import { recordRevision, diffFields } from "@/services/revisions";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth<Ctx>("VIEWER", async (_req, _user, ctx) => {
  const { id } = await ctx.params;
  const item = await db.responsePattern.findUnique({
    where: { id },
    include: {
      intent: true,
      triggers: { include: { dialect: true, sentence: true, expression: true } },
      variants: { include: { dialect: true, sentence: true }, orderBy: { weight: "desc" } },
    },
  });
  if (!item) throw new ApiError(404, "Response pattern not found");
  return NextResponse.json({ item });
});

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  intentId: z.string().nullish(),
  description: z.string().nullish(),
  addTrigger: z.object({ textOriginal: z.string().min(1), dialectId: z.string().nullish() }).optional(),
  removeTriggerId: z.string().optional(),
  addVariant: z
    .object({
      textOriginal: z.string().min(1),
      dialectId: z.string().nullish(),
      weight: z.number().int().min(0).max(1000).optional(),
      commonness: z.enum(["VERY_HIGH", "HIGH", "MEDIUM", "LOW", "RARE", "CONTEXTUAL", "UNKNOWN"]).optional(),
      notes: z.string().nullish(),
    })
    .optional(),
  updateVariant: z
    .object({
      id: z.string(),
      textOriginal: z.string().min(1).optional(),
      dialectId: z.string().nullish(),
      weight: z.number().int().min(0).max(1000).optional(),
      commonness: z.enum(["VERY_HIGH", "HIGH", "MEDIUM", "LOW", "RARE", "CONTEXTUAL", "UNKNOWN"]).optional(),
      verification: z.enum(["UNVERIFIED", "VERIFIED", "REJECTED"]).optional(),
      quality: z.enum(["GOLD", "SILVER", "REFERENCE", "CANDIDATE"]).optional(),
      status: z.enum(["ACTIVE", "REJECTED"]).optional(),
      rejectionReason: z
        .enum(["UNNATURAL", "TOO_FORMAL", "SOUNDS_MSA", "WRONG_DIALECT", "WRONG_CONTEXT", "OUTDATED", "INCORRECT", "POOR_TRANSLATION", "OTHER"])
        .nullish(),
      rejectionNote: z.string().nullish(),
      notes: z.string().nullish(),
    })
    .optional(),
  removeVariantId: z.string().optional(),
});

export const PATCH = withAuth<Ctx>("EDITOR", async (req, user, ctx) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  const before = await db.responsePattern.findUnique({ where: { id } });
  if (!before) throw new ApiError(404, "Response pattern not found");

  await db.$transaction(async (tx) => {
    const { addTrigger, removeTriggerId, addVariant, updateVariant, removeVariantId, ...fields } = body;
    if (Object.keys(fields).length) {
      const updated = await tx.responsePattern.update({ where: { id }, data: fields });
      const { oldDiff, newDiff } = diffFields(before as never, updated as never);
      if (Object.keys(newDiff).length) {
        await recordRevision(tx, { entityType: "responsePattern", entityId: id, kind: "UPDATE", oldValue: oldDiff, newValue: newDiff, userId: user.id });
      }
    }
    if (addTrigger) {
      await tx.responseTrigger.create({
        data: {
          patternId: id,
          textOriginal: addTrigger.textOriginal,
          textNormalized: normalizeArabic(addTrigger.textOriginal),
          dialectId: addTrigger.dialectId ?? null,
        },
      });
      await recordRevision(tx, { entityType: "responsePattern", entityId: id, kind: "UPDATE", newValue: { triggerAdded: addTrigger }, userId: user.id });
    }
    if (removeTriggerId) {
      const t = await tx.responseTrigger.delete({ where: { id: removeTriggerId } });
      await recordRevision(tx, { entityType: "responsePattern", entityId: id, kind: "UPDATE", oldValue: { triggerRemoved: t }, userId: user.id });
    }
    if (addVariant) {
      await tx.responseVariant.create({
        data: {
          patternId: id,
          textOriginal: addVariant.textOriginal,
          textNormalized: normalizeArabic(addVariant.textOriginal),
          dialectId: addVariant.dialectId ?? null,
          weight: addVariant.weight ?? 10,
          commonness: addVariant.commonness ?? "UNKNOWN",
          notes: addVariant.notes ?? null,
        },
      });
      await recordRevision(tx, { entityType: "responsePattern", entityId: id, kind: "UPDATE", newValue: { variantAdded: addVariant }, userId: user.id });
    }
    if (updateVariant) {
      const { id: variantId, ...vData } = updateVariant;
      const vBefore = await tx.responseVariant.findUnique({ where: { id: variantId } });
      if (!vBefore || vBefore.patternId !== id) throw new ApiError(404, "Variant not found");
      const data: Record<string, unknown> = { ...vData };
      if (typeof vData.textOriginal === "string") data.textNormalized = normalizeArabic(vData.textOriginal);
      const vAfter = await tx.responseVariant.update({ where: { id: variantId }, data });
      const { oldDiff, newDiff } = diffFields(vBefore as never, vAfter as never);
      if (Object.keys(newDiff).length) {
        await recordRevision(tx, { entityType: "responseVariant", entityId: variantId, kind: "UPDATE", oldValue: oldDiff, newValue: newDiff, userId: user.id });
      }
    }
    if (removeVariantId) {
      const v = await tx.responseVariant.delete({ where: { id: removeVariantId } });
      await recordRevision(tx, { entityType: "responsePattern", entityId: id, kind: "UPDATE", oldValue: { variantRemoved: v }, userId: user.id });
    }
  });

  const item = await db.responsePattern.findUnique({
    where: { id },
    include: {
      intent: true,
      triggers: { include: { dialect: true } },
      variants: { include: { dialect: true }, orderBy: { weight: "desc" } },
    },
  });
  return NextResponse.json({ item });
});

export const DELETE = withAuth<Ctx>("EDITOR", async (_req, user, ctx) => {
  const { id } = await ctx.params;
  const before = await db.responsePattern.findUnique({ where: { id }, include: { triggers: true, variants: true } });
  if (!before) throw new ApiError(404, "Response pattern not found");
  await db.$transaction(async (tx) => {
    await tx.responsePattern.delete({ where: { id } });
    await recordRevision(tx, { entityType: "responsePattern", entityId: id, kind: "DELETE", oldValue: before, userId: user.id });
  });
  return NextResponse.json({ ok: true });
});
