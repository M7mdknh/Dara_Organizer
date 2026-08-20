import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, parseBody, ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { recordRevision } from "@/services/revisions";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  nameAr: z.string().nullish(),
  description: z.string().nullish(),
  parentId: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const PATCH = withAuth<Ctx>("ADMIN", async (req, user, ctx) => {
  const { id } = await ctx.params;
  const data = await parseBody(req, patchSchema);
  const before = await db.category.findUnique({ where: { id } });
  if (!before) throw new ApiError(404, "Category not found");
  if (data.parentId === id) throw new ApiError(400, "A category cannot be its own parent");
  const updated = await db.category.update({ where: { id }, data });
  await recordRevision(db, { entityType: "category", entityId: id, kind: "UPDATE", oldValue: before, newValue: updated, userId: user.id });
  return NextResponse.json({ item: updated });
});

export const DELETE = withAuth<Ctx>("ADMIN", async (_req, user, ctx) => {
  const { id } = await ctx.params;
  const before = await db.category.findUnique({
    where: { id },
    include: { _count: { select: { sentences: true, expressions: true, conversations: true, children: true } } },
  });
  if (!before) throw new ApiError(404, "Category not found");
  const c = before._count;
  if (c.sentences || c.expressions || c.conversations || c.children) {
    throw new ApiError(400, "Category is in use. Move or re-categorize linked records first, or disable it.");
  }
  await db.category.delete({ where: { id } });
  await recordRevision(db, { entityType: "category", entityId: id, kind: "DELETE", oldValue: before, userId: user.id });
  return NextResponse.json({ ok: true });
});
