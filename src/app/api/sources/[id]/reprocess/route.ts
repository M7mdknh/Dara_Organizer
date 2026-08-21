import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { withAuth, ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { parseFile } from "@/domains/imports/parse";
import { getObject, storageEnabled } from "@/services/storage";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Re-parses a Source's immutable original file (from object storage) into a
 * brand-new ImportJob, without requiring the user to upload the file again.
 * The Source itself and every prior ImportJob/derived record are untouched
 * — this only adds a new job the user can run through the (now-fixed)
 * analyze/process pipeline exactly like a fresh upload. See
 * /api/sources/[id]/archive-import for cleaning up records derived from a
 * specific bad prior run once the reprocess has produced good data.
 */
export const POST = withAuth<Ctx>("EDITOR", async (_req, user, ctx) => {
  const { id } = await ctx.params;
  const source = await db.source.findUnique({ where: { id } });
  if (!source) throw new ApiError(404, "Source not found");
  if (!source.objectKey) {
    throw new ApiError(400, "This source has no stored original file to reprocess (uploaded before object storage was configured, or storage-less dev mode).");
  }
  if (!storageEnabled()) throw new ApiError(400, "Object storage is not configured.");

  const buffer = await getObject(source.objectKey);
  const parsed = parseFile(source.filename ?? source.name, buffer);
  if (parsed.rows.length === 0) throw new ApiError(400, "The stored original file has no data rows.");

  const job = await db.importJob.create({
    data: {
      sourceId: source.id,
      status: "MAPPING",
      filename: source.filename,
      fileFormat: source.type.toLowerCase(),
      totalRows: parsed.rows.length,
      createdById: user.id,
    },
  });
  const chunkSize = 1000;
  for (let i = 0; i < parsed.rows.length; i += chunkSize) {
    await db.importRow.createMany({
      data: parsed.rows.slice(i, i + chunkSize).map((r, j) => ({
        jobId: job.id,
        rowIndex: i + j + 1,
        rawData: r as unknown as Prisma.InputJsonValue,
      })),
    });
  }

  return NextResponse.json({
    job: {
      id: job.id,
      filename: source.filename ?? source.name,
      columns: parsed.columns,
      rowCount: parsed.rows.length,
      preview: parsed.rows.slice(0, 10),
    },
  });
});
