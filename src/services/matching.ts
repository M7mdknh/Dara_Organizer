import type { Prisma, PrismaClient } from "@prisma/client";
import { normalizeArabic } from "@/services/normalization";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Deterministic matching engine used by imports and manual entry.
 *
 * Decision policy (see CLAUDE.md rule 5):
 * - EXACT / NORMALIZED match with compatible dialect+language context
 *   → safe idempotent match, no reviewer burden.
 * - Same concept + same dialect but different surface text
 *   → semantic overlap, requires human review (never auto-merge).
 * - Same normalized text but a different dialect claim
 *   → dialect disagreement, requires review.
 * - No match → new record.
 */

export type ExpressionMatchResult =
  | { kind: "exact"; expressionId: string }
  | { kind: "normalized"; expressionId: string }
  | { kind: "dialect_conflict"; expressionId: string }
  | { kind: "semantic_conflict"; conceptId: string; competingExpressionIds: string[] }
  | { kind: "new" };

export async function matchExpression(
  tx: Tx,
  candidate: {
    textOriginal: string;
    languageId: string;
    dialectId?: string | null;
    conceptId?: string | null;
  },
): Promise<ExpressionMatchResult> {
  const normalized = normalizeArabic(candidate.textOriginal);

  const sameText = await tx.expression.findMany({
    where: { textNormalized: normalized, languageId: candidate.languageId, status: "ACTIVE" },
    select: { id: true, textOriginal: true, dialectId: true },
    take: 20,
  });

  const sameDialect = sameText.filter((e) => (e.dialectId ?? null) === (candidate.dialectId ?? null));
  if (sameDialect.length > 0) {
    const exact =
      sameDialect.find(
        (e) => e.textOriginal.normalize("NFC").trim() === candidate.textOriginal.normalize("NFC").trim(),
      ) ?? null;
    if (exact) return { kind: "exact", expressionId: exact.id };
    return { kind: "normalized", expressionId: sameDialect[0].id };
  }

  // Same surface form but claimed for a different dialect → human decision.
  if (sameText.length > 0 && candidate.dialectId) {
    return { kind: "dialect_conflict", expressionId: sameText[0].id };
  }

  // Different text for a concept that already has expressions in this dialect
  // → semantic overlap (possible synonym/variant), never silently merged.
  if (candidate.conceptId && candidate.dialectId) {
    const competing = await tx.conceptExpression.findMany({
      where: {
        conceptId: candidate.conceptId,
        expression: {
          dialectId: candidate.dialectId,
          languageId: candidate.languageId,
          status: "ACTIVE",
          textNormalized: { not: normalized },
        },
      },
      select: { expressionId: true },
      take: 20,
    });
    if (competing.length > 0) {
      return {
        kind: "semantic_conflict",
        conceptId: candidate.conceptId,
        competingExpressionIds: competing.map((c) => c.expressionId),
      };
    }
  }

  return { kind: "new" };
}

export type SentenceMatchResult =
  | { kind: "exact"; sentenceId: string }
  | { kind: "normalized"; sentenceId: string }
  | { kind: "new" };

export async function matchSentence(
  tx: Tx,
  candidate: { textOriginal: string; languageId: string; dialectId?: string | null },
): Promise<SentenceMatchResult> {
  const normalized = normalizeArabic(candidate.textOriginal);
  const matches = await tx.sentence.findMany({
    where: {
      textNormalized: normalized,
      languageId: candidate.languageId,
      dialectId: candidate.dialectId ?? undefined,
      status: "ACTIVE",
    },
    select: { id: true, textOriginal: true },
    take: 10,
  });
  if (matches.length === 0) return { kind: "new" };
  const exact = matches.find(
    (m) => m.textOriginal.normalize("NFC").trim() === candidate.textOriginal.normalize("NFC").trim(),
  );
  if (exact) return { kind: "exact", sentenceId: exact.id };
  return { kind: "normalized", sentenceId: matches[0].id };
}
