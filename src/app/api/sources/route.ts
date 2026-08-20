import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, parseBody, pageParams } from "@/lib/api";
import { db } from "@/lib/db";

export const GET = withAuth("VIEWER", async (req) => {
  const { skip, take, page, pageSize } = pageParams(req);
  const [items, total] = await Promise.all([
    db.source.findMany({
      include: {
        importJobs: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { expressions: true, sentences: true, conversations: true, concepts: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    db.source.count(),
  ]);
  return NextResponse.json({ items, total, page, pageSize });
});

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["MANUAL", "XLSX", "CSV", "TXT", "PASTE", "AI", "REFERENCE", "AUDIO", "VIDEO"]),
  description: z.string().nullish(),
  license: z.string().nullish(),
  reliability: z.string().nullish(),
  defaultTraining: z.enum(["ELIGIBLE", "NOT_ELIGIBLE", "UNDECIDED"]).optional(),
});

export const POST = withAuth("EDITOR", async (req, user) => {
  const data = await parseBody(req, createSchema);
  const created = await db.source.create({ data: { ...data, createdById: user.id } });
  return NextResponse.json({ item: created }, { status: 201 });
});
