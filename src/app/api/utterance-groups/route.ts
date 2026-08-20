import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withAuth, parseBody, pageParams } from "@/lib/api";
import { db } from "@/lib/db";
import { recordRevision } from "@/services/revisions";

export const GET = withAuth("VIEWER", async (req) => {
  const { skip, take, page, pageSize, url } = pageParams(req);
  const q = url.searchParams.get("q")?.trim();
  const where: Prisma.UtteranceGroupWhereInput = q
    ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { meaning: { contains: q, mode: "insensitive" } }] }
    : {};
  const [items, total] = await Promise.all([
    db.utteranceGroup.findMany({
      where,
      include: {
        intent: true,
        sentences: { where: { status: "ACTIVE" }, include: { dialect: true, language: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip,
      take,
    }),
    db.utteranceGroup.count({ where }),
  ]);
  return NextResponse.json({ items, total, page, pageSize });
});

const createSchema = z.object({
  name: z.string().min(1),
  meaning: z.string().nullish(),
  intentId: z.string().nullish(),
  notes: z.string().nullish(),
});

export const POST = withAuth("EDITOR", async (req, user) => {
  const data = await parseBody(req, createSchema);
  const created = await db.utteranceGroup.create({ data });
  await recordRevision(db, { entityType: "utteranceGroup", entityId: created.id, kind: "CREATE", newValue: created, userId: user.id });
  return NextResponse.json({ item: created }, { status: 201 });
});
