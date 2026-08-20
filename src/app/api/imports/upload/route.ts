import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { withAuth, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { parseFile } from "@/domains/imports/parse";
import { putObject, importObjectKey, storageEnabled, sha256 } from "@/services/storage";

const MAX_ROWS = 500_000;

/**
 * Accepts one or many files (multipart) or pasted text and creates one
 * ImportJob per file, in MAPPING state, with raw rows preserved untouched.
 * The original file is persisted immutably to object storage when
 * configured (STORAGE_PROVIDER=s3); reprocessing an import always re-reads
 * from the original object or the already-parsed rows, never a mutated copy.
 */
export const POST = withAuth("EDITOR", async (req, user) => {
  const contentType = req.headers.get("content-type") ?? "";
  const jobs: {
    id: string;
    filename: string;
    columns: string[];
    rowCount: number;
    preview: Record<string, string>[];
    duplicateOfSourceId: string | null;
  }[] = [];

  const inputs: { filename: string; buffer: Buffer; format: string; sourceName?: string; mimeType: string }[] = [];
  const maxBytes = env.MAX_UPLOAD_SIZE_MB * 1024 * 1024;
  const allowedTypes = env.ALLOWED_IMPORT_TYPES.split(",").map((t) => t.trim().toLowerCase());

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (!files.length) return jsonError(400, "No files provided");
    for (const file of files) {
      if (file.size > maxBytes) return jsonError(400, `${file.name} exceeds the ${env.MAX_UPLOAD_SIZE_MB} MB limit`);
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "txt";
      if (!allowedTypes.includes(ext) && !["xlsx", "xls", "tsv"].includes(ext)) {
        return jsonError(400, `${file.name}: unsupported file type (.${ext})`);
      }
      inputs.push({
        filename: file.name,
        buffer: Buffer.from(await file.arrayBuffer()),
        format: ext,
        mimeType: file.type || "application/octet-stream",
      });
    }
  } else {
    const body = await req.json().catch(() => null);
    if (!body?.text || typeof body.text !== "string" || !body.text.trim()) {
      return jsonError(400, "Provide files (multipart) or pasted text");
    }
    inputs.push({
      filename: body.name && typeof body.name === "string" ? body.name : "pasted-text",
      buffer: Buffer.from(body.text, "utf-8"),
      format: "paste",
      sourceName: body.name,
      mimeType: "text/plain",
    });
  }

  for (const input of inputs) {
    const parsed = parseFile(input.filename, input.buffer);
    if (parsed.rows.length === 0) return jsonError(400, `${input.filename} contains no data rows`);
    if (parsed.rows.length > MAX_ROWS) return jsonError(400, `${input.filename} exceeds ${MAX_ROWS} rows`);

    const checksum = sha256(input.buffer);
    const duplicate = await db.source.findFirst({ where: { checksum }, select: { id: true, name: true } });

    const source = await db.source.create({
      data: {
        name: input.sourceName ?? input.filename,
        type: input.format === "paste" ? "PASTE" : input.format === "xlsx" || input.format === "xls" ? "XLSX" : input.format === "csv" || input.format === "tsv" ? "CSV" : "TXT",
        filename: input.filename,
        createdById: user.id,
        checksum,
        fileSize: input.buffer.length,
        mimeType: input.mimeType,
      },
    });

    if (storageEnabled()) {
      const key = importObjectKey(source.id, input.filename);
      await putObject(key, input.buffer, input.mimeType);
      await db.source.update({ where: { id: source.id }, data: { objectKey: key, storedAt: new Date() } });
    }

    const job = await db.importJob.create({
      data: {
        sourceId: source.id,
        status: "MAPPING",
        filename: input.filename,
        fileFormat: input.format,
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
    jobs.push({
      id: job.id,
      filename: input.filename,
      columns: parsed.columns,
      rowCount: parsed.rows.length,
      preview: parsed.rows.slice(0, 10),
      duplicateOfSourceId: duplicate?.id ?? null,
    });
  }

  return NextResponse.json({ jobs }, { status: 201 });
});
