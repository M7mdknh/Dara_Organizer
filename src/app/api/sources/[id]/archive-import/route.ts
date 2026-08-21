import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, parseBody, ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { recordRevision } from "@/services/revisions";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({ importJobId: z.string() });

/**
 * Archives (never deletes) the Sentence/Expression records a specific prior
 * ImportJob on this Source produced — for cleaning up after a bad import
 * has been reprocessed. Only touches records that are still UNVERIFIED;
 * anything a human has since verified is left untouched, and nothing is
 * deleted (archived records are excluded from normal listings via
 * status="ACTIVE" filtering, but remain in the database with full history).
 */
export const POST = withAuth<Ctx>("EDITOR", async (req, user, ctx) => {
  const { id } = await ctx.params;
  const { importJobId } = await parseBody(req, bodySchema);

  const job = await db.importJob.findUnique({ where: { id: importJobId } });
  if (!job || job.sourceId !== id) throw new ApiError(404, "Import job not found for this source");

  const rows = await db.importRow.findMany({
    where: { jobId: importJobId, entityId: { not: null } },
    select: { entityType: true, entityId: true },
  });

  let archivedExpressions = 0;
  let archivedSentences = 0;

  await db.$transaction(async (tx) => {
    for (const row of rows) {
      if (!row.entityId) continue;
      if (row.entityType === "expression") {
        const before = await tx.expression.findUnique({ where: { id: row.entityId } });
        if (!before || before.verification === "VERIFIED" || before.status !== "ACTIVE") continue;
        await tx.expression.update({ where: { id: row.entityId }, data: { status: "ARCHIVED" } });
        await recordRevision(tx, {
          entityType: "expression",
          entityId: row.entityId,
          kind: "UPDATE",
          oldValue: { status: before.status },
          newValue: { status: "ARCHIVED" },
          userId: user.id,
          reason: `Archived: reprocessing import job ${importJobId}`,
        });
        archivedExpressions++;
      } else if (row.entityType === "sentence") {
        const before = await tx.sentence.findUnique({ where: { id: row.entityId } });
        if (!before || before.verification === "VERIFIED" || before.status !== "ACTIVE") continue;
        await tx.sentence.update({ where: { id: row.entityId }, data: { status: "ARCHIVED" } });
        await recordRevision(tx, {
          entityType: "sentence",
          entityId: row.entityId,
          kind: "UPDATE",
          oldValue: { status: before.status },
          newValue: { status: "ARCHIVED" },
          userId: user.id,
          reason: `Archived: reprocessing import job ${importJobId}`,
        });
        archivedSentences++;
      }
    }
  }, { timeout: 30_000 });

  return NextResponse.json({ archivedExpressions, archivedSentences, consideredRows: rows.length });
});
