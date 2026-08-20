import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, parseBody } from "@/lib/api";
import { updateDialect, deleteDialect, mergeDialect } from "@/domains/dialects/service";

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
  const updated = await updateDialect(id, data, user.id);
  return NextResponse.json({ item: updated });
});

export const DELETE = withAuth<Ctx>("ADMIN", async (_req, user, ctx) => {
  const { id } = await ctx.params;
  await deleteDialect(id, user.id);
  return NextResponse.json({ ok: true });
});

// POST /api/dialects/[id]  { action: "merge", intoId }
export const POST = withAuth<Ctx>("ADMIN", async (req, user, ctx) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, z.object({ action: z.literal("merge"), intoId: z.string() }));
  await mergeDialect(id, body.intoId, user.id);
  return NextResponse.json({ ok: true });
});
