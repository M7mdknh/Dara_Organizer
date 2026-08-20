import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withAuth, parseBody, pageParams } from "@/lib/api";
import { db } from "@/lib/db";
import { normalizeArabic } from "@/services/normalization";
import { dialectWithDescendants } from "@/services/dialectTree";
import { recordRevision } from "@/services/revisions";

export const GET = withAuth("VIEWER", async (req) => {
  const { skip, take, page, pageSize, url } = pageParams(req);
  const p = url.searchParams;
  const where: Prisma.ConversationWhereInput = {};
  const q = p.get("q")?.trim();
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { turns: { some: { textNormalized: { contains: normalizeArabic(q) } } } },
    ];
  }
  if (p.get("dialectId")) where.dialectId = { in: await dialectWithDescendants(p.get("dialectId")!) };
  if (p.get("situationId")) where.situationId = p.get("situationId")!;
  if (p.get("quality")) where.quality = p.get("quality") as never;
  if (p.get("verification")) where.verification = p.get("verification") as never;
  if (p.get("categoryId")) where.categories = { some: { categoryId: p.get("categoryId")! } };

  const [items, total] = await Promise.all([
    db.conversation.findMany({
      where,
      include: {
        dialect: true,
        situation: true,
        categories: { include: { category: true } },
        turns: { orderBy: { orderIndex: "asc" }, take: 4 },
        _count: { select: { turns: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip,
      take,
    }),
    db.conversation.count({ where }),
  ]);
  return NextResponse.json({ items, total, page, pageSize });
});

const turnSchema = z.object({
  speaker: z.string().min(1),
  textOriginal: z.string().min(1),
  dialectId: z.string().nullish(),
  intentId: z.string().nullish(),
  functionId: z.string().nullish(),
  notes: z.string().nullish(),
});

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullish(),
  dialectId: z.string().nullish(),
  situationId: z.string().nullish(),
  quality: z.enum(["GOLD", "SILVER", "REFERENCE", "CANDIDATE"]).optional(),
  categoryIds: z.array(z.string()).optional(),
  sourceId: z.string().nullish(),
  turns: z.array(turnSchema).optional(),
});

export const POST = withAuth("EDITOR", async (req, user) => {
  const data = await parseBody(req, createSchema);
  const created = await db.$transaction(async (tx) => {
    const { categoryIds, turns, ...fields } = data;
    const conversation = await tx.conversation.create({
      data: {
        ...fields,
        ...(categoryIds?.length
          ? { categories: { create: categoryIds.map((categoryId) => ({ categoryId })) } }
          : {}),
      },
    });
    if (turns?.length) {
      await tx.conversationTurn.createMany({
        data: turns.map((t, i) => ({
          conversationId: conversation.id,
          orderIndex: i,
          speaker: t.speaker,
          textOriginal: t.textOriginal,
          textNormalized: normalizeArabic(t.textOriginal),
          dialectId: t.dialectId ?? null,
          intentId: t.intentId ?? null,
          functionId: t.functionId ?? null,
          notes: t.notes ?? null,
        })),
      });
    }
    await recordRevision(tx, { entityType: "conversation", entityId: conversation.id, kind: "CREATE", newValue: { ...conversation, turns }, userId: user.id });
    return conversation;
  });
  const full = await db.conversation.findUnique({
    where: { id: created.id },
    include: { turns: { orderBy: { orderIndex: "asc" } } },
  });
  return NextResponse.json({ item: full }, { status: 201 });
});
