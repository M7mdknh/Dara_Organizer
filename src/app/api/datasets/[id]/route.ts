import { NextResponse } from "next/server";
import { withAuth, ApiError } from "@/lib/api";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth<Ctx>("VIEWER", async (_req, _user, ctx) => {
  const { id } = await ctx.params;
  const item = await db.datasetVersion.findUnique({
    where: { id },
    include: { createdBy: { select: { id: true, name: true } }, _count: { select: { records: true } } },
  });
  if (!item) throw new ApiError(404, "Dataset not found");
  return NextResponse.json({ item });
});

export const DELETE = withAuth<Ctx>("ADMIN", async (_req, _user, ctx) => {
  const { id } = await ctx.params;
  await db.datasetVersion.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
