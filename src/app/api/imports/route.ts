import { NextResponse } from "next/server";
import { withAuth, pageParams } from "@/lib/api";
import { db } from "@/lib/db";

export const GET = withAuth("VIEWER", async (req) => {
  const { skip, take, page, pageSize } = pageParams(req);
  const [items, total] = await Promise.all([
    db.importJob.findMany({
      include: { source: true, createdBy: { select: { id: true, name: true } }, _count: { select: { rows: true, reviewItems: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    db.importJob.count(),
  ]);
  return NextResponse.json({ items, total, page, pageSize });
});
