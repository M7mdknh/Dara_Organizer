import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withAuth, parseBody, pageParams } from "@/lib/api";
import { db } from "@/lib/db";
import { normalizeArabic } from "@/services/normalization";
import { recordRevision } from "@/services/revisions";

export const GET = withAuth("VIEWER", async (req) => {
  const { skip, take, page, pageSize, url } = pageParams(req);
  const q = url.searchParams.get("q")?.trim();
  const intentId = url.searchParams.get("intentId");
  const where: Prisma.ResponsePatternWhereInput = {};
  if (intentId) where.intentId = intentId;
  if (q) {
    const nq = normalizeArabic(q);
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { triggers: { some: { textNormalized: { contains: nq } } } },
      { variants: { some: { textNormalized: { contains: nq } } } },
    ];
  }
  const [items, total] = await Promise.all([
    db.responsePattern.findMany({
      where,
      include: {
        intent: true,
        triggers: { include: { dialect: true } },
        variants: { where: { status: "ACTIVE" }, include: { dialect: true }, orderBy: { weight: "desc" } },
      },
      orderBy: { updatedAt: "desc" },
      skip,
      take,
    }),
    db.responsePattern.count({ where }),
  ]);
  return NextResponse.json({ items, total, page, pageSize });
});

const createSchema = z.object({
  name: z.string().min(1),
  intentId: z.string().nullish(),
  description: z.string().nullish(),
  triggers: z
    .array(z.object({ textOriginal: z.string().min(1), dialectId: z.string().nullish() }))
    .optional(),
  variants: z
    .array(
      z.object({
        textOriginal: z.string().min(1),
        dialectId: z.string().nullish(),
        weight: z.number().int().min(0).max(1000).optional(),
        commonness: z.enum(["VERY_HIGH", "HIGH", "MEDIUM", "LOW", "RARE", "CONTEXTUAL", "UNKNOWN"]).optional(),
        notes: z.string().nullish(),
      }),
    )
    .optional(),
});

export const POST = withAuth("EDITOR", async (req, user) => {
  const data = await parseBody(req, createSchema);
  const created = await db.$transaction(async (tx) => {
    const pattern = await tx.responsePattern.create({
      data: { name: data.name, intentId: data.intentId ?? null, description: data.description ?? null },
    });
    if (data.triggers?.length) {
      await tx.responseTrigger.createMany({
        data: data.triggers.map((t) => ({
          patternId: pattern.id,
          textOriginal: t.textOriginal,
          textNormalized: normalizeArabic(t.textOriginal),
          dialectId: t.dialectId ?? null,
        })),
      });
    }
    if (data.variants?.length) {
      await tx.responseVariant.createMany({
        data: data.variants.map((v) => ({
          patternId: pattern.id,
          textOriginal: v.textOriginal,
          textNormalized: normalizeArabic(v.textOriginal),
          dialectId: v.dialectId ?? null,
          weight: v.weight ?? 10,
          commonness: v.commonness ?? "UNKNOWN",
          notes: v.notes ?? null,
        })),
      });
    }
    await recordRevision(tx, { entityType: "responsePattern", entityId: pattern.id, kind: "CREATE", newValue: { ...pattern, ...data }, userId: user.id });
    return pattern;
  });
  const full = await db.responsePattern.findUnique({
    where: { id: created.id },
    include: { triggers: true, variants: { orderBy: { weight: "desc" } } },
  });
  return NextResponse.json({ item: full }, { status: 201 });
});
