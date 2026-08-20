import { NextResponse } from "next/server";
import { withAuth, ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { dialectWithDescendants } from "@/services/dialectTree";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth<Ctx>("VIEWER", async (_req, _user, ctx) => {
  const { id } = await ctx.params;
  const dialect = await db.dialectNode.findUnique({ where: { id } });
  if (!dialect) throw new ApiError(404, "Dialect not found");
  const ids = await dialectWithDescendants(id);

  const [
    expressions,
    sentences,
    conversations,
    responsePatterns,
    expressionsWithPronunciation,
    sentencesWithPronunciation,
    qualityBreakdown,
    categoryBreakdown,
    recent,
  ] = await Promise.all([
    db.expression.count({ where: { dialectId: { in: ids }, status: "ACTIVE" } }),
    db.sentence.count({ where: { dialectId: { in: ids }, status: "ACTIVE" } }),
    db.conversation.count({ where: { dialectId: { in: ids } } }),
    db.responseTrigger.findMany({ where: { dialectId: { in: ids } }, select: { patternId: true }, distinct: ["patternId"] }),
    db.expression.count({ where: { dialectId: { in: ids }, status: "ACTIVE", pronunciations: { some: {} } } }),
    db.sentence.count({ where: { dialectId: { in: ids }, status: "ACTIVE", pronunciations: { some: {} } } }),
    db.sentence.groupBy({ by: ["quality"], where: { dialectId: { in: ids }, status: "ACTIVE" }, _count: true }),
    db.sentenceCategory.findMany({
      where: { sentence: { dialectId: { in: ids }, status: "ACTIVE" } },
      include: { category: true },
      take: 500,
    }),
    db.sentence.findMany({
      where: { dialectId: { in: ids }, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, textOriginal: true, createdAt: true },
    }),
  ]);

  const categoryCounts = new Map<string, number>();
  for (const sc of categoryBreakdown) {
    categoryCounts.set(sc.category.name, (categoryCounts.get(sc.category.name) ?? 0) + 1);
  }

  return NextResponse.json({
    dialect,
    counts: { expressions, sentences, conversations, responsePatterns: responsePatterns.length },
    pronunciationCoverage: {
      expressions: expressions ? expressionsWithPronunciation / expressions : 0,
      sentences: sentences ? sentencesWithPronunciation / sentences : 0,
    },
    qualityBreakdown: Object.fromEntries(qualityBreakdown.map((q) => [q.quality, q._count])),
    categoryDistribution: [...categoryCounts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    recent,
  });
});
