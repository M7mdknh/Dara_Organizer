import { NextResponse } from "next/server";
import { withAuth, ApiError } from "@/lib/api";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth<Ctx>("VIEWER", async (req, _user, ctx) => {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const includeRows = url.searchParams.get("rows") === "true";
  const item = await db.importJob.findUnique({
    where: { id },
    include: {
      source: true,
      createdBy: { select: { id: true, name: true } },
      reviewItems: { where: { status: "PENDING" }, take: 50 },
      ...(includeRows ? { rows: { orderBy: { rowIndex: "asc" }, take: 500 } } : {}),
    },
  });
  if (!item) throw new ApiError(404, "Import job not found");
  return NextResponse.json({ item });
});
