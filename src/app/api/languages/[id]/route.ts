import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, parseBody, ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { recordRevision } from "@/services/revisions";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  nameAr: z.string().nullish(),
  direction: z.enum(["ltr", "rtl"]).optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const PATCH = withAuth<Ctx>("ADMIN", async (req, user, ctx) => {
  const { id } = await ctx.params;
  const data = await parseBody(req, patchSchema);
  const before = await db.language.findUnique({ where: { id } });
  if (!before) throw new ApiError(404, "Language not found");
  const updated = await db.language.update({ where: { id }, data });
  await recordRevision(db, { entityType: "language", entityId: id, kind: "UPDATE", oldValue: before, newValue: updated, userId: user.id });
  return NextResponse.json({ item: updated });
});

export const DELETE = withAuth<Ctx>("ADMIN", async (_req, user, ctx) => {
  const { id } = await ctx.params;
  const before = await db.language.findUnique({
    where: { id },
    include: { _count: { select: { expressions: true, sentences: true } } },
  });
  if (!before) throw new ApiError(404, "Language not found");
  if (before._count.expressions || before._count.sentences) {
    throw new ApiError(400, "Language has linked data. Disable it instead of deleting.");
  }
  await db.language.delete({ where: { id } });
  await recordRevision(db, { entityType: "language", entityId: id, kind: "DELETE", oldValue: before, userId: user.id });
  return NextResponse.json({ ok: true });
});
