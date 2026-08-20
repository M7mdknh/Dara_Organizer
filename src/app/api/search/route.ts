import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { db } from "@/lib/db";
import { normalizeArabic } from "@/services/normalization";

/**
 * Universal search: combines exact/normalized lexical matching with
 * relational expansion (concept -> related expressions/sentences).
 */
export const GET = withAuth("VIEWER", async (req) => {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ results: null });
  const nq = normalizeArabic(q);

  const [expressions, concepts, sentences, conversations, responseVariants, triggers, sources] =
    await Promise.all([
      db.expression.findMany({
        where: {
          OR: [
            { textNormalized: { contains: nq } },
            { textOriginal: { contains: q } },
            { meaningNote: { contains: q, mode: "insensitive" } },
          ],
          status: "ACTIVE",
        },
        include: {
          dialect: true,
          language: true,
          concepts: { include: { concept: true } },
        },
        take: 10,
      }),
      db.concept.findMany({
        where: {
          OR: [
            { key: { contains: q, mode: "insensitive" } },
            { gloss: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 5,
      }),
      db.sentence.findMany({
        where: {
          OR: [{ textNormalized: { contains: nq } }, { meaning: { contains: q, mode: "insensitive" } }],
          status: "ACTIVE",
        },
        include: { dialect: true, language: true },
        take: 10,
      }),
      db.conversationTurn.findMany({
        where: { textNormalized: { contains: nq } },
        include: { conversation: { include: { dialect: true } } },
        take: 8,
      }),
      db.responseVariant.findMany({
        where: { textNormalized: { contains: nq }, status: "ACTIVE" },
        include: { pattern: true, dialect: true },
        take: 8,
      }),
      db.responseTrigger.findMany({
        where: { textNormalized: { contains: nq } },
        include: { pattern: { include: { variants: { where: { status: "ACTIVE" }, orderBy: { weight: "desc" }, take: 5 } } }, dialect: true },
        take: 5,
      }),
      db.source.findMany({
        where: { name: { contains: q, mode: "insensitive" } },
        take: 5,
      }),
    ]);

  // Relational expansion: pull sibling expressions of matched concepts
  const conceptIds = new Set<string>();
  for (const e of expressions) for (const ce of e.concepts) conceptIds.add(ce.conceptId);
  for (const c of concepts) conceptIds.add(c.id);
  const related = conceptIds.size
    ? await db.conceptExpression.findMany({
        where: { conceptId: { in: [...conceptIds] } },
        include: { expression: { include: { dialect: true, language: true } }, concept: true },
        take: 30,
      })
    : [];

  return NextResponse.json({
    results: {
      query: q,
      expressions,
      concepts,
      sentences,
      conversations,
      responseVariants,
      triggers,
      sources,
      related,
    },
  });
});
