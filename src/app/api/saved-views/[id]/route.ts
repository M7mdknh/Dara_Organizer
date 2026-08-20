import { NextResponse } from "next/server";
import { withAuth, ApiError } from "@/lib/api";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = withAuth<Ctx>("VIEWER", async (_req, user, ctx) => {
  const { id } = await ctx.params;
  const view = await db.savedView.findUnique({ where: { id } });
  if (!view) throw new ApiError(404, "Saved view not found");
  if (view.userId !== user.id && user.role !== "ADMIN") throw new ApiError(403, "Not your saved view");
  await db.savedView.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
