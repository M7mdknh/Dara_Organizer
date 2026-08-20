import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { withAuth, parseBody, pageParams } from "@/lib/api";
import { db } from "@/lib/db";
import { normalizeArabic } from "@/services/normalization";
import { dialectWithDescendants } from "@/services/dialectTree";
import { createExpression, expressionInputSchema } from "@/domains/expressions/service";

export const GET = withAuth("VIEWER", async (req) => {
  const { skip, take, page, pageSize, url } = pageParams(req);
  const p = url.searchParams;

  const where: Prisma.ExpressionWhereInput = { status: "ACTIVE" };
  const q = p.get("q")?.trim();
  if (q) {
    where.OR = [
      { textNormalized: { contains: normalizeArabic(q) } },
      { textOriginal: { contains: q } },
      { meaningNote: { contains: q, mode: "insensitive" } },
    ];
  }
  const dialectId = p.get("dialectId");
  if (dialectId) {
    where.dialectId = { in: await dialectWithDescendants(dialectId) };
  }
  if (p.get("languageId")) where.languageId = p.get("languageId")!;
  if (p.get("quality")) where.quality = p.get("quality") as never;
  if (p.get("verification")) where.verification = p.get("verification") as never;
  if (p.get("training")) where.training = p.get("training") as never;
  if (p.get("type")) where.type = p.get("type") as never;
  if (p.get("origin")) where.origin = p.get("origin") as never;
  if (p.get("sourceId")) where.sourceId = p.get("sourceId")!;
  if (p.get("conceptId")) where.concepts = { some: { conceptId: p.get("conceptId")! } };
  if (p.get("categoryId")) where.categories = { some: { categoryId: p.get("categoryId")! } };

  const [items, total] = await Promise.all([
    db.expression.findMany({
      where,
      include: {
        dialect: true,
        language: true,
        register: true,
        concepts: { include: { concept: true } },
        _count: { select: { pronunciations: true, sentences: true, relationsFrom: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip,
      take,
    }),
    db.expression.count({ where }),
  ]);

  return NextResponse.json({ items, total, page, pageSize });
});

export const POST = withAuth("EDITOR", async (req, user) => {
  const input = await parseBody(req, expressionInputSchema);
  const result = await createExpression(input, user.id);
  return NextResponse.json(result, { status: result.matched ? 200 : 201 });
});
