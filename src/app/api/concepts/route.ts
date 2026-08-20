import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withAuth, parseBody, pageParams } from "@/lib/api";
import { db } from "@/lib/db";
import { recordRevision } from "@/services/revisions";
import { triggerEmbedding } from "@/services/ai/embedTrigger";

export const GET = withAuth("VIEWER", async (req) => {
  const { skip, take, page, pageSize, url } = pageParams(req);
  const q = url.searchParams.get("q")?.trim();
  const where: Prisma.ConceptWhereInput = q
    ? {
        OR: [
          { key: { contains: q, mode: "insensitive" } },
          { gloss: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};
  const [items, total] = await Promise.all([
    db.concept.findMany({
      where,
      include: {
        expressions: { include: { expression: { include: { dialect: true, language: true } } } },
        _count: { select: { sentences: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip,
      take,
    }),
    db.concept.count({ where }),
  ]);
  return NextResponse.json({ items, total, page, pageSize });
});

const createSchema = z.object({
  key: z.string().min(1).regex(/^[A-Z0-9_]+$/, "Use UPPER_SNAKE_CASE, e.g. TIME_NOW"),
  gloss: z.string().min(1),
  description: z.string().nullish(),
  notes: z.string().nullish(),
});

export const POST = withAuth("EDITOR", async (req, user) => {
  const data = await parseBody(req, createSchema);
  const existing = await db.concept.findUnique({ where: { key: data.key } });
  if (existing) return NextResponse.json({ item: existing, matched: true });
  const created = await db.concept.create({ data });
  await recordRevision(db, { entityType: "concept", entityId: created.id, kind: "CREATE", newValue: created, userId: user.id });
  void triggerEmbedding("CONCEPT", created.id);
  return NextResponse.json({ item: created }, { status: 201 });
});
