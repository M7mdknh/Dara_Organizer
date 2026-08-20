import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withAuth, parseBody } from "@/lib/api";
import { db } from "@/lib/db";

export const GET = withAuth("VIEWER", async (req, user) => {
  const url = new URL(req.url);
  const viewKey = url.searchParams.get("viewKey");
  const items = await db.savedView.findMany({
    where: {
      OR: [{ userId: user.id }, { shared: true }],
      ...(viewKey ? { viewKey } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ items });
});

const createSchema = z.object({
  name: z.string().min(1),
  viewKey: z.string().min(1),
  filters: z.record(z.string(), z.unknown()),
  shared: z.boolean().optional(),
});

export const POST = withAuth("VIEWER", async (req, user) => {
  const data = await parseBody(req, createSchema);
  const created = await db.savedView.upsert({
    where: { userId_viewKey_name: { userId: user.id, viewKey: data.viewKey, name: data.name } },
    create: { ...data, filters: data.filters as Prisma.InputJsonValue, userId: user.id },
    update: { filters: data.filters as Prisma.InputJsonValue, shared: data.shared ?? false },
  });
  return NextResponse.json({ item: created }, { status: 201 });
});
