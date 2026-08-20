import { withAuth, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { exportRows, toJsonl, toCsv } from "@/domains/datasets/export";
import { putObject, exportObjectKey, storageEnabled } from "@/services/storage";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Streams the export directly to the browser (this is a click-to-download
 * link in the UI, so it stays synchronous) and, when object storage is
 * configured, also persists a durable copy under exports/<datasetId>/... —
 * exports are never *only* streamed to the requester. For very large
 * datasets built without an active request (e.g. a "regenerate" action),
 * see the DATASET_EXPORT background job (src/worker/processors/datasetExport.ts).
 */
export const GET = withAuth<Ctx>("VIEWER", async (req, user, ctx) => {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "jsonl";
  const split = url.searchParams.get("split") ?? undefined;
  if (!["jsonl", "csv"].includes(format)) return jsonError(400, "format must be jsonl or csv");

  const { rows, dataset } = await exportRows(id, split);
  const body = format === "jsonl" ? toJsonl(rows, dataset.exportSchema) : toCsv(rows, dataset.exportSchema);
  const filename = `${dataset.name.replace(/[^a-zA-Z0-9_-]+/g, "_")}_v${dataset.version}${split ? `_${split.toLowerCase()}` : ""}.${format}`;

  await db.datasetVersion.update({ where: { id }, data: { status: "EXPORTED" } });
  await db.auditLog.create({ data: { action: "dataset.export", detail: { datasetId: id, format, split: split ?? "all", rows: rows.length }, userId: user.id } });

  if (storageEnabled()) {
    const buffer = Buffer.from(body, "utf-8");
    const exportRecord = await db.datasetExport.create({
      data: { datasetId: id, format, split: split ?? null, objectKey: "", createdById: user.id },
    });
    const key = exportObjectKey(id, exportRecord.id, format, split);
    const stored = await putObject(key, buffer, format === "jsonl" ? "application/jsonl" : "text/csv");
    await db.datasetExport.update({
      where: { id: exportRecord.id },
      data: { objectKey: key, fileSize: stored.size, checksum: stored.checksum },
    });
  }

  return new Response(body, {
    headers: {
      "Content-Type": format === "jsonl" ? "application/jsonl; charset=utf-8" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});
