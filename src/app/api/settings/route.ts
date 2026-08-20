import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withAuth, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export const GET = withAuth("VIEWER", async () => {
  const items = await db.setting.findMany();
  const settings = Object.fromEntries(items.map((s) => [s.key, s.value]));
  // Never expose secrets; API keys live in env only. Semantic-matching
  // parameters are env-controlled deployment configuration (not secrets),
  // shown here read-only for operator visibility.
  return NextResponse.json({
    settings,
    aiKeyConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    openaiKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
    semanticMatching: {
      enabled: env.SEMANTIC_MATCHING_ENABLED,
      topK: env.SEMANTIC_TOP_K,
      minSimilarity: env.SEMANTIC_VECTOR_MIN_SIMILARITY,
      autoApprove: env.SEMANTIC_AUTO_APPROVE,
      adjudicationEnabled: env.SEMANTIC_ADJUDICATION_ENABLED,
      embeddingModel: env.OPENAI_EMBEDDING_MODEL,
      embeddingDimensions: env.OPENAI_EMBEDDING_DIMENSIONS,
      reasoningModel: env.OPENAI_MODEL,
      adjudicationModel: env.OPENAI_ADJUDICATION_MODEL,
    },
    backgroundJobs: {
      enabled: env.BACKGROUND_JOBS_ENABLED,
      redisConfigured: Boolean(env.REDIS_URL),
    },
    storage: {
      provider: env.STORAGE_PROVIDER,
    },
  });
});

const schema = z.object({ key: z.string().min(1), value: z.unknown() });

export const PUT = withAuth("ADMIN", async (req, user) => {
  const { key, value } = await parseBody(req, schema);
  const item = await db.setting.upsert({
    where: { key },
    create: { key, value: value as Prisma.InputJsonValue },
    update: { value: value as Prisma.InputJsonValue },
  });
  await db.auditLog.create({ data: { action: "settings.update", detail: { key }, userId: user.id } });
  return NextResponse.json({ item });
});
