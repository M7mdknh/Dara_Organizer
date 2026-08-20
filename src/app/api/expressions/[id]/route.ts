import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, parseBody, ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { recordRevision } from "@/services/revisions";
import { updateExpression, expressionInputSchema } from "@/domains/expressions/service";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth<Ctx>("VIEWER", async (_req, _user, ctx) => {
  const { id } = await ctx.params;
  const item = await db.expression.findUnique({
    where: { id },
    include: {
      dialect: true,
      language: true,
      register: true,
      source: true,
      concepts: { include: { concept: true } },
      categories: { include: { category: true } },
      pronunciations: { include: { dialect: true } },
      relationsFrom: { include: { to: { include: { dialect: true, language: true } } } },
      relationsTo: { include: { from: { include: { dialect: true, language: true } } } },
      sentences: { include: { sentence: { include: { dialect: true, language: true } } }, take: 50 },
      responseTriggers: { include: { pattern: true } },
    },
  });
  if (!item) throw new ApiError(404, "Expression not found");
  return NextResponse.json({ item });
});

const patchSchema = expressionInputSchema.partial().extend({
  verification: z.enum(["UNVERIFIED", "VERIFIED", "REJECTED"]).optional(),
  status: z.enum(["ACTIVE", "REJECTED"]).optional(),
  rejectionReason: z
    .enum(["UNNATURAL", "TOO_FORMAL", "SOUNDS_MSA", "WRONG_DIALECT", "WRONG_CONTEXT", "OUTDATED", "INCORRECT", "POOR_TRANSLATION", "OTHER"])
    .nullish(),
  rejectionNote: z.string().nullish(),
  reason: z.string().optional(),
});

export const PATCH = withAuth<Ctx>("EDITOR", async (req, user, ctx) => {
  const { id } = await ctx.params;
  const { reason, verification, ...data } = await parseBody(req, patchSchema);
  const extra: Record<string, unknown> = {};
  if (verification) {
    extra.verification = verification;
    extra.verifiedById = verification === "VERIFIED" ? user.id : null;
    extra.verifiedAt = verification === "VERIFIED" ? new Date() : null;
  }
  const updated = await updateExpression(id, { ...data, ...extra } as never, user.id, reason);
  return NextResponse.json({ item: updated });
});

export const DELETE = withAuth<Ctx>("EDITOR", async (_req, user, ctx) => {
  const { id } = await ctx.params;
  const before = await db.expression.findUnique({ where: { id } });
  if (!before) throw new ApiError(404, "Expression not found");
  await db.$transaction(async (tx) => {
    await tx.expression.delete({ where: { id } });
    await recordRevision(tx, { entityType: "expression", entityId: id, kind: "DELETE", oldValue: before, userId: user.id });
  });
  return NextResponse.json({ ok: true });
});
