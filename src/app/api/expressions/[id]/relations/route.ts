import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { addExpressionRelation } from "@/domains/expressions/service";

type Ctx = { params: Promise<{ id: string }> };

const relationSchema = z.object({
  toId: z.string(),
  type: z.enum([
    "SYNONYM",
    "NEAR_SYNONYM",
    "DIALECT_EQUIVALENT",
    "TRANSLATION",
    "REGIONAL_VARIANT",
    "SPELLING_VARIANT",
    "PRONUNCIATION_VARIANT",
    "FORMAL_EQUIVALENT",
    "INFORMAL_EQUIVALENT",
    "SLANG_EQUIVALENT",
    "RELATED",
    "COMMON_RESPONSE",
  ]),
  notes: z.string().nullish(),
});

export const POST = withAuth<Ctx>("EDITOR", async (req, user, ctx) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, relationSchema);
  const relation = await addExpressionRelation(id, body.toId, body.type, body.notes ?? null, user.id);
  return NextResponse.json({ relation }, { status: 201 });
});

export const DELETE = withAuth<Ctx>("EDITOR", async (req, _user, ctx) => {
  await ctx.params;
  const body = await parseBody(req, z.object({ relationId: z.string() }));
  await db.expressionRelation.delete({ where: { id: body.relationId } });
  return NextResponse.json({ ok: true });
});
