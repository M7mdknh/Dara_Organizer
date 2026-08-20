import { NextResponse } from "next/server";
import { withAuth, parseBody } from "@/lib/api";
import { resolveSchema, resolveReviewItem } from "@/domains/review/service";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withAuth<Ctx>("REVIEWER", async (req, user, ctx) => {
  const { id } = await ctx.params;
  const input = await parseBody(req, resolveSchema);
  const item = await resolveReviewItem(id, input, user.id);
  return NextResponse.json({ item });
});
