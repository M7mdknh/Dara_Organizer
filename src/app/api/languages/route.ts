import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { recordRevision } from "@/services/revisions";

export const GET = withAuth("VIEWER", async () => {
  const items = await db.language.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return NextResponse.json({ items });
});

const createSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  nameAr: z.string().nullish(),
  direction: z.enum(["ltr", "rtl"]).optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const POST = withAuth("ADMIN", async (req, user) => {
  const data = await parseBody(req, createSchema);
  const created = await db.language.create({ data });
  await recordRevision(db, { entityType: "language", entityId: created.id, kind: "CREATE", newValue: created, userId: user.id });
  return NextResponse.json({ item: created }, { status: 201 });
});
