import { NextResponse } from "next/server";
import { withAuth, parseBody } from "@/lib/api";
import {
  flatTaxonomySchema,
  listFlatTaxonomy,
  createFlatTaxonomy,
} from "@/domains/taxonomy/service";

type Ctx = { params: Promise<{ type: string }> };

export const GET = withAuth<Ctx>("VIEWER", async (_req, _user, ctx) => {
  const { type } = await ctx.params;
  return NextResponse.json({ items: await listFlatTaxonomy(type) });
});

export const POST = withAuth<Ctx>("ADMIN", async (req, user, ctx) => {
  const { type } = await ctx.params;
  const data = await parseBody(req, flatTaxonomySchema);
  const created = await createFlatTaxonomy(type, data, user.id);
  return NextResponse.json({ item: created }, { status: 201 });
});
