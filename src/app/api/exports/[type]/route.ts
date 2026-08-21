import { withAuth, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import {
  exportConceptLexicon,
  exportSentenceEquivalents,
  exportConversationTraining,
  exportChatFinetune,
  toJsonlGeneric,
} from "@/domains/datasets/meaning-exports";

type Ctx = { params: Promise<{ type: string }> };

const EXPORTERS = {
  "concept-lexicon": exportConceptLexicon,
  "sentence-equivalents": exportSentenceEquivalents,
  "conversation-training": exportConversationTraining,
  "chat-finetune": exportChatFinetune,
} as const;

/**
 * Purposeful, meaning-centered training exports (CLAUDE.md: sentences and
 * equivalent utterances over raw rows). See
 * src/domains/datasets/meaning-exports.ts for the schemas.
 */
export const GET = withAuth<Ctx>("VIEWER", async (req, user, ctx) => {
  const { type } = await ctx.params;
  const exporter = EXPORTERS[type as keyof typeof EXPORTERS];
  if (!exporter) return jsonError(400, `Unknown export type "${type}". Use one of: ${Object.keys(EXPORTERS).join(", ")}`);

  const url = new URL(req.url);
  const dialectId = url.searchParams.get("dialectId") || undefined;
  const includeUnverified = url.searchParams.get("includeUnverified") === "true";

  const rows = await exporter({ dialectId, includeUnverified });
  const body = toJsonlGeneric(rows);

  await db.auditLog.create({
    data: { action: "export.meaning_centered", detail: { type, dialectId: dialectId ?? null, includeUnverified, rows: rows.length }, userId: user.id },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/jsonl; charset=utf-8",
      "Content-Disposition": `attachment; filename="${type}.jsonl"`,
    },
  });
});
