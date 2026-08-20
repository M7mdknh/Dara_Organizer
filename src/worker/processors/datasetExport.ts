import type { Job } from "bullmq";
import { db } from "@/lib/db";
import { exportRows, toJsonl, toCsv } from "@/domains/datasets/export";
import { putObject, exportObjectKey, storageEnabled } from "@/services/storage";
import { logger } from "@/lib/logger";

export interface DatasetExportJobData {
  datasetId: string;
  format: "jsonl" | "csv";
  split?: "TRAIN" | "VALIDATION" | "TEST";
  userId?: string;
}

/**
 * Renders and durably persists a dataset export to object storage. Exports
 * are never only streamed to the requester — a copy is stored under
 * exports/<datasetId>/... so the build remains reproducible/re-downloadable.
 */
export async function processDatasetExport(job: Job<DatasetExportJobData>) {
  const { datasetId, format, split, userId } = job.data;
  const start = Date.now();
  const { rows, dataset } = await exportRows(datasetId, split);
  const body = format === "jsonl" ? toJsonl(rows, dataset.exportSchema) : toCsv(rows, dataset.exportSchema);
  const buffer = Buffer.from(body, "utf-8");

  const exportRecord = await db.datasetExport.create({
    data: { datasetId, format, split: split ?? null, objectKey: "", createdById: userId },
  });
  const key = exportObjectKey(datasetId, exportRecord.id, format, split);

  let objectKey = key;
  let checksum: string | undefined;
  if (storageEnabled()) {
    const stored = await putObject(key, buffer, format === "jsonl" ? "application/jsonl" : "text/csv");
    checksum = stored.checksum;
  } else {
    objectKey = ""; // storage not configured — export was computed but not durably persisted
    logger.warn("dataset_export.storage_disabled", { datasetId });
  }

  await db.datasetExport.update({
    where: { id: exportRecord.id },
    data: { objectKey, fileSize: buffer.length, checksum },
  });
  await db.datasetVersion.update({ where: { id: datasetId }, data: { status: "EXPORTED" } });

  logger.info("dataset_export.done", { datasetId, format, split, rows: rows.length, durationMs: Date.now() - start, bullJobId: job.id });
  return { exportId: exportRecord.id, objectKey, rows: rows.length };
}
