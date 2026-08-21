import { db } from "@/lib/db";
import { normalizeArabic } from "@/services/normalization";
import type { ImportMapping } from "@/domains/imports/service";

/**
 * Deterministic conversation/response detection: only runs when the import
 * mapping has an explicit "speaker" column — i.e. the source itself
 * declares dialogue structure. This deliberately never infers a
 * conversation from plain sequential sentences with no speaker information,
 * per CLAUDE.md: never fabricate response relationships from unrelated
 * neighboring rows.
 *
 * Builds one Conversation with an ordered ConversationTurn per row, and
 * proposes a ReviewItem (type RESPONSE_PATTERN) for each adjacent
 * speaker-change pair — accepting it (see src/domains/review/service.ts)
 * creates the actual ResponsePattern/ResponseTrigger/ResponseVariant
 * records. Nothing conversational is auto-applied without a human decision.
 */
export async function buildConversationFromSpeakerRows(jobId: string, mapping: ImportMapping): Promise<void> {
  const speakerCol = mapping.columns.speaker;
  if (!speakerCol) return;

  const rows = await db.importRow.findMany({
    where: { jobId, status: { in: ["ACCEPTED", "MATCHED"] }, entityType: "sentence" },
    orderBy: { rowIndex: "asc" },
  });
  if (rows.length < 2) return;

  const turns: { speaker: string; text: string; sentenceId: string; dialectId: string | null }[] = [];
  for (const row of rows) {
    const raw = row.rawData as Record<string, string>;
    const speaker = (raw[speakerCol] ?? "").trim();
    if (!speaker || !row.entityId) continue;
    const sentence = await db.sentence.findUnique({ where: { id: row.entityId }, select: { textOriginal: true, dialectId: true } });
    if (!sentence) continue;
    turns.push({ speaker, text: sentence.textOriginal, sentenceId: row.entityId, dialectId: sentence.dialectId });
  }
  if (turns.length < 2) return;

  const job = await db.importJob.findUnique({ where: { id: jobId }, include: { source: { select: { name: true } } } });

  const conversation = await db.conversation.create({
    data: {
      title: `Imported conversation — ${job?.source?.name ?? "import"}`,
      dialectId: turns[0].dialectId,
      origin: "IMPORT",
      quality: "CANDIDATE",
      verification: "UNVERIFIED",
      sourceId: job?.sourceId,
    },
  });

  for (let i = 0; i < turns.length; i++) {
    await db.conversationTurn.create({
      data: {
        conversationId: conversation.id,
        orderIndex: i + 1,
        speaker: turns[i].speaker,
        textOriginal: turns[i].text,
        textNormalized: normalizeArabic(turns[i].text),
        dialectId: turns[i].dialectId,
        sentenceId: turns[i].sentenceId,
      },
    });
  }

  for (let i = 0; i < turns.length - 1; i++) {
    if (turns[i].speaker === turns[i + 1].speaker) continue; // same speaker continuing — not a trigger/response pair
    await db.reviewItem.create({
      data: {
        type: "RESPONSE_PATTERN",
        title: `Possible response: "${turns[i].text}" → "${turns[i + 1].text}"`,
        payload: {
          trigger: { text: turns[i].text, sentenceId: turns[i].sentenceId },
          response: { text: turns[i + 1].text, sentenceId: turns[i + 1].sentenceId },
          dialectId: turns[i].dialectId,
        },
        entityType: "conversation",
        entityId: conversation.id,
        importJobId: jobId,
      },
    });
  }
}
