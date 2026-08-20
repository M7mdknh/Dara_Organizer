import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { withAuth, pageParams } from "@/lib/api";
import { db } from "@/lib/db";

export const GET = withAuth("REVIEWER", async (req) => {
  const { skip, take, page, pageSize, url } = pageParams(req);
  const p = url.searchParams;
  const where: Prisma.ReviewItemWhereInput = {};
  where.status = (p.get("status") as never) ?? "PENDING";
  if (p.get("type")) where.type = p.get("type") as never;
  if (p.get("importJobId")) where.importJobId = p.get("importJobId")!;

  const [items, total, countsByType] = await Promise.all([
    db.reviewItem.findMany({
      where,
      include: { importJob: { include: { source: true } }, resolvedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
      skip,
      take,
    }),
    db.reviewItem.count({ where }),
    db.reviewItem.groupBy({ by: ["type"], where: { status: "PENDING" }, _count: true }),
  ]);

  // hydrate expression details for candidate/competing so reviewers see full context
  const expressionIds = new Set<string>();
  for (const item of items) {
    const payload = item.payload as { candidate?: { id?: string }; competing?: string[] } | null;
    if (payload?.candidate?.id) expressionIds.add(payload.candidate.id);
    for (const c of payload?.competing ?? []) expressionIds.add(c);
    if (item.entityId && item.entityType === "expression") expressionIds.add(item.entityId);
    if (item.candidateEntityId) expressionIds.add(item.candidateEntityId);
  }
  const expressions = expressionIds.size
    ? await db.expression.findMany({
        where: { id: { in: [...expressionIds] } },
        include: { dialect: true, language: true, concepts: { include: { concept: true } } },
      })
    : [];

  return NextResponse.json({
    items,
    total,
    page,
    pageSize,
    countsByType: Object.fromEntries(countsByType.map((c) => [c.type, c._count])),
    expressions: Object.fromEntries(expressions.map((e) => [e.id, e])),
  });
});
