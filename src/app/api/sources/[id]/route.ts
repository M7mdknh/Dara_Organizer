import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, parseBody, ApiError } from "@/lib/api";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth<Ctx>("VIEWER", async (_req, _user, ctx) => {
  const { id } = await ctx.params;
  const item = await db.source.findUnique({
    where: { id },
    include: {
      importJobs: { orderBy: { createdAt: "desc" } },
      expressions: { include: { dialect: true, language: true }, take: 100 },
      sentences: { include: { dialect: true, language: true }, take: 100 },
      conversations: { take: 50 },
      concepts: { take: 50 },
      _count: { select: { expressions: true, sentences: true, conversations: true, concepts: true } },
    },
  });
  if (!item) throw new ApiError(404, "Source not found");
  return NextResponse.json({ item });
});

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullish(),
  license: z.string().nullish(),
  reliability: z.string().nullish(),
  defaultTraining: z.enum(["ELIGIBLE", "NOT_ELIGIBLE", "UNDECIDED"]).optional(),
});

export const PATCH = withAuth<Ctx>("EDITOR", async (req, _user, ctx) => {
  const { id } = await ctx.params;
  const data = await parseBody(req, patchSchema);
  const updated = await db.source.update({ where: { id }, data });
  return NextResponse.json({ item: updated });
});
