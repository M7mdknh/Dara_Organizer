import type { Job } from "bullmq";
import { db } from "@/lib/db";
import { getObject } from "@/services/storage";
import { parseFile } from "@/domains/imports/parse";
import { logger } from "@/lib/logger";

export interface ImportParseJobData {
  jobId: string;
  sourceId: string;
  objectKey: string;
  filename: string;
}

/**
 * Downloads the immutable original file from object storage and splits it
 * into ImportRow records. Idempotent: reprocessing a job that already has
 * rows just replaces them (rows carry no downstream state until matching
 * runs), so a retried/duplicated IMPORT_PARSE job is safe.
 */
export async function processImportParse(job: Job<ImportParseJobData>) {
  const { jobId, objectKey, filename } = job.data;
  const start = Date.now();
  logger.info("import_parse.start", { jobId, filename, bullJobId: job.id });

  const buffer = await getObject(objectKey);
  const parsed = parseFile(filename, buffer);

  await db.importRow.deleteMany({ where: { jobId } });
  const chunkSize = 1000;
  for (let i = 0; i < parsed.rows.length; i += chunkSize) {
    await db.importRow.createMany({
      data: parsed.rows.slice(i, i + chunkSize).map((r, j) => ({
        jobId,
        rowIndex: i + j + 1,
        rawData: r,
      })),
    });
    await job.updateProgress(Math.round(((i + chunkSize) / parsed.rows.length) * 100));
  }

  await db.importJob.update({
    where: { id: jobId },
    data: { status: "MAPPING", totalRows: parsed.rows.length, jobId: job.id ?? null },
  });

  logger.info("import_parse.done", { jobId, rows: parsed.rows.length, durationMs: Date.now() - start });
  return { columns: parsed.columns, rowCount: parsed.rows.length };
}
