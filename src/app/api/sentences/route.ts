import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { withAuth, parseBody, pageParams } from "@/lib/api";
import { db } from "@/lib/db";
import { normalizeArabic } from "@/services/normalization";
import { dialectWithDescendants } from "@/services/dialectTree";
import { createSentence, sentenceInputSchema } from "@/domains/sentences/service";
import { triggerEmbedding } from "@/services/ai/embedTrigger";

export const GET = withAuth("VIEWER", async (req) => {
  const { skip, take, page, pageSize, url } = pageParams(req);
  const p = url.searchParams;
  const where: Prisma.SentenceWhereInput = {};

  if (p.get("status")) where.status = p.get("status")!;
  else where.status = "ACTIVE";

  const q = p.get("q")?.trim();
  if (q) {
    where.OR = [
      { textNormalized: { contains: normalizeArabic(q) } },
      { textOriginal: { contains: q } },
      { meaning: { contains: q, mode: "insensitive" } },
    ];
  }
  if (p.get("dialectId")) where.dialectId = { in: await dialectWithDescendants(p.get("dialectId")!) };
  if (p.get("languageId")) where.languageId = p.get("languageId")!;
  if (p.get("quality")) where.quality = p.get("quality") as never;
  if (p.get("verification")) where.verification = p.get("verification") as never;
  if (p.get("training")) where.training = p.get("training") as never;
  if (p.get("origin")) where.origin = p.get("origin") as never;
  if (p.get("naturalness")) where.naturalness = p.get("naturalness") as never;
  if (p.get("commonness")) where.commonness = p.get("commonness") as never;
  if (p.get("intentId")) where.intentId = p.get("intentId")!;
  if (p.get("situationId")) where.situationId = p.get("situationId")!;
  if (p.get("registerId")) where.registerId = p.get("registerId")!;
  if (p.get("functionId")) where.functionId = p.get("functionId")!;
  if (p.get("sourceId")) where.sourceId = p.get("sourceId")!;
  if (p.get("utteranceGroupId")) where.utteranceGroupId = p.get("utteranceGroupId")!;
  if (p.get("categoryId")) where.categories = { some: { categoryId: p.get("categoryId")! } };
  if (p.get("topicId")) where.topics = { some: { topicId: p.get("topicId")! } };
  if (p.get("conceptId")) where.concepts = { some: { conceptId: p.get("conceptId")! } };
  if (p.get("expressionId")) where.expressions = { some: { expressionId: p.get("expressionId")! } };
  if (p.get("hasPronunciation") === "true") where.pronunciations = { some: {} };
  if (p.get("hasPronunciation") === "false") where.pronunciations = { none: {} };
  if (p.get("collectionId")) {
    const items = await db.collectionItem.findMany({
      where: { collectionId: p.get("collectionId")!, entityType: "sentence" },
      select: { entityId: true },
    });
    where.id = { in: items.map((i) => i.entityId) };
  }
  const minLen = Number(p.get("minLength"));
  const maxLen = Number(p.get("maxLength"));
  // sentence length filtering happens in SQL via raw filter on char_length
  const lengthFilter: Prisma.SentenceWhereInput[] = [];
  if (minLen > 0 || maxLen > 0) {
    const ids = await db.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Sentence"
      WHERE char_length("textOriginal") >= ${minLen > 0 ? minLen : 0}
        AND char_length("textOriginal") <= ${maxLen > 0 ? maxLen : 100000}
    `;
    lengthFilter.push({ id: { in: ids.map((r) => r.id) } });
  }
  if (lengthFilter.length) where.AND = lengthFilter;

  const [items, total] = await Promise.all([
    db.sentence.findMany({
      where,
      include: {
        dialect: true,
        language: true,
        intent: true,
        situation: true,
        register: true,
        function: true,
        utteranceGroup: true,
        source: true,
        categories: { include: { category: true } },
        topics: { include: { topic: true } },
        _count: { select: { pronunciations: true, conversationTurns: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip,
      take,
    }),
    db.sentence.count({ where }),
  ]);
  return NextResponse.json({ items, total, page, pageSize });
});

export const POST = withAuth("EDITOR", async (req, user) => {
  const input = await parseBody(req, sentenceInputSchema);
  const result = await createSentence(input, user.id);
  if (!result.matched) void triggerEmbedding("SENTENCE", result.sentence.id);
  return NextResponse.json(result, { status: result.matched ? 200 : 201 });
});
