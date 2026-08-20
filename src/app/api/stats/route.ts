import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { db } from "@/lib/db";

export const GET = withAuth("VIEWER", async () => {
  const [
    concepts,
    expressions,
    sentences,
    conversations,
    responsePatterns,
    reviewPending,
    recentImports,
    sentencesByDialect,
    sentencesByQuality,
    expressionsByQuality,
    verifiedSentences,
    sentencesWithPronunciation,
    expressionsWithPronunciation,
    functionCoverage,
    languages,
    sentencesByLanguage,
  ] = await Promise.all([
    db.concept.count(),
    db.expression.count({ where: { status: "ACTIVE" } }),
    db.sentence.count({ where: { status: "ACTIVE" } }),
    db.conversation.count(),
    db.responsePattern.count(),
    db.reviewItem.count({ where: { status: "PENDING" } }),
    db.importJob.findMany({ orderBy: { createdAt: "desc" }, take: 5, include: { source: true } }),
    db.sentence.groupBy({ by: ["dialectId"], where: { status: "ACTIVE" }, _count: true }),
    db.sentence.groupBy({ by: ["quality"], where: { status: "ACTIVE" }, _count: true }),
    db.expression.groupBy({ by: ["quality"], where: { status: "ACTIVE" }, _count: true }),
    db.sentence.count({ where: { status: "ACTIVE", verification: "VERIFIED" } }),
    db.sentence.count({ where: { status: "ACTIVE", pronunciations: { some: {} } } }),
    db.expression.count({ where: { status: "ACTIVE", pronunciations: { some: {} } } }),
    db.conversationalFunction.findMany({
      include: { _count: { select: { sentences: true, conversationTurns: true } } },
      where: { enabled: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.language.findMany({ where: { enabled: true } }),
    db.sentence.groupBy({ by: ["languageId"], where: { status: "ACTIVE" }, _count: true }),
  ]);

  const dialects = await db.dialectNode.findMany();
  const dialectNames = new Map(dialects.map((d) => [d.id, d.name]));
  const languageNames = new Map(languages.map((l) => [l.id, l.name]));

  return NextResponse.json({
    totals: {
      concepts,
      expressions,
      sentences,
      conversations,
      responsePatterns,
      reviewPending,
      verifiedSentences,
    },
    pronunciationCoverage: {
      sentences: sentences ? sentencesWithPronunciation / sentences : 0,
      expressions: expressions ? expressionsWithPronunciation / expressions : 0,
    },
    dialectDistribution: sentencesByDialect
      .map((d) => ({ name: d.dialectId ? (dialectNames.get(d.dialectId) ?? "Unknown") : "Unassigned", dialectId: d.dialectId, count: d._count }))
      .sort((a, b) => b.count - a.count),
    languageDistribution: sentencesByLanguage
      .map((l) => ({ name: languageNames.get(l.languageId) ?? l.languageId, count: l._count }))
      .sort((a, b) => b.count - a.count),
    qualityDistribution: {
      sentences: Object.fromEntries(sentencesByQuality.map((x) => [x.quality, x._count])),
      expressions: Object.fromEntries(expressionsByQuality.map((x) => [x.quality, x._count])),
    },
    conversationalCoverage: functionCoverage.map((f) => ({
      id: f.id,
      name: f.name,
      count: f._count.sentences + f._count.conversationTurns,
    })),
    recentImports,
  });
});
