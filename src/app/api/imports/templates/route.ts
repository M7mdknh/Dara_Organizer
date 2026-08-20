import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { db } from "@/lib/db";

export const GET = withAuth("VIEWER", async () => {
  const items = await db.importTemplate.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ items });
});
