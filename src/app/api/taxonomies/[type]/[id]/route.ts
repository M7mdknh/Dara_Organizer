import { NextResponse } from "next/server";
import { withAuth, parseBody } from "@/lib/api";
import {
  flatTaxonomySchema,
  updateFlatTaxonomy,
  deleteFlatTaxonomy,
} from "@/domains/taxonomy/service";

type Ctx = { params: Promise<{ type: string; id: string }> };

export const PATCH = withAuth<Ctx>("ADMIN", async (req, user, ctx) => {
  const { type, id } = await ctx.params;
  const data = await parseBody(req, flatTaxonomySchema.partial());
  const updated = await updateFlatTaxonomy(type, id, data, user.id);
  return NextResponse.json({ item: updated });
});

export const DELETE = withAuth<Ctx>("ADMIN", async (_req, user, ctx) => {
  const { type, id } = await ctx.params;
  await deleteFlatTaxonomy(type, id, user.id);
  return NextResponse.json({ ok: true });
});
