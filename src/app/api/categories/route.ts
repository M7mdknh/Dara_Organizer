import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { recordRevision } from "@/services/revisions";

export const GET = withAuth("VIEWER", async () => {
  const items = await db.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { sentences: true, expressions: true, conversations: true } } },
  });
  return NextResponse.json({ items });
});

const createSchema = z.object({
  name: z.string().min(1),
  nameAr: z.string().nullish(),
  description: z.string().nullish(),
  parentId: z.string().nullish(),
});

export const POST = withAuth("ADMIN", async (req, user) => {
  const data = await parseBody(req, createSchema);
  const created = await db.category.create({ data });
  await recordRevision(db, { entityType: "category", entityId: created.id, kind: "CREATE", newValue: created, userId: user.id });
  return NextResponse.json({ item: created }, { status: 201 });
});
