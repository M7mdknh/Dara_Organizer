import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, parseBody } from "@/lib/api";
import { db } from "@/lib/db";

export const GET = withAuth("VIEWER", async () => {
  const items = await db.collection.findMany({
    include: { _count: { select: { items: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ items });
});

const createSchema = z.object({ name: z.string().min(1), description: z.string().nullish() });

export const POST = withAuth("EDITOR", async (req) => {
  const data = await parseBody(req, createSchema);
  const created = await db.collection.create({ data });
  return NextResponse.json({ item: created }, { status: 201 });
});
