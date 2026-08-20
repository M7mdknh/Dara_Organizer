import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { db } from "@/lib/db";
import { listStaleEmbeddings, findMissingEmbeddings } from "@/services/ai/embeddings";

/** Admin maintenance view: how many concepts/sentences/expressions have current, stale, or missing embeddings. */
export const GET = withAuth("ADMIN", async () => {
  const [totalConcepts, totalSentences, totalExpressions, countRows, stale, missingConcepts, missingSentences] =
    await Promise.all([
      db.concept.count(),
      db.sentence.count({ where: { status: "ACTIVE" } }),
      db.expression.count({ where: { status: "ACTIVE" } }),
      db.$queryRaw<{ entityType: string; count: bigint }[]>`SELECT "entityType", count(*) FROM "Embedding" GROUP BY "entityType"`,
      listStaleEmbeddings(50),
      findMissingEmbeddings("CONCEPT", 1),
      findMissingEmbeddings("SENTENCE", 1),
    ]);

  const counted = Object.fromEntries(countRows.map((r) => [r.entityType, Number(r.count)]));

  return NextResponse.json({
    concepts: { total: totalConcepts, embedded: counted.CONCEPT ?? 0, hasMissing: missingConcepts.length > 0 },
    sentences: { total: totalSentences, embedded: counted.SENTENCE ?? 0, hasMissing: missingSentences.length > 0 },
    expressions: { total: totalExpressions, embedded: counted.EXPRESSION ?? 0 },
    staleCount: stale.length,
    staleSample: stale.slice(0, 10),
  });
});
