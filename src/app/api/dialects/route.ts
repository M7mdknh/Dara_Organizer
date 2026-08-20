import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, parseBody } from "@/lib/api";
import { listDialectTree, createDialect } from "@/domains/dialects/service";

export const GET = withAuth("VIEWER", async () => {
  return NextResponse.json({ items: await listDialectTree() });
});

const createSchema = z.object({
  name: z.string().min(1),
  nameAr: z.string().nullish(),
  description: z.string().nullish(),
  parentId: z.string().nullish(),
});

export const POST = withAuth("ADMIN", async (req, user) => {
  const data = await parseBody(req, createSchema);
  const created = await createDialect(data, user.id);
  return NextResponse.json({ item: created }, { status: 201 });
});
