/**
 * CLI maintenance script: reprocesses a Source's immutable stored original
 * through the current pipeline (deterministic guard + AI understanding +
 * matching/extraction), exactly like POST /api/sources/[id]/reprocess ->
 * GET /api/imports/[id]/analyze -> POST /api/imports/[id]/process, without
 * requiring a browser session. Intended for operator use (e.g. `railway run`)
 * to fix a source that was imported before a pipeline bug fix, without
 * re-uploading the file.
 *
 * Usage: tsx scripts/reprocess-source.ts <sourceId> <userId> [--archive=<oldImportJobId>]
 */
import "dotenv/config";
import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { parseFile } from "../src/domains/imports/parse";
import { analyzeImportJobWithAi, toImportMapping } from "../src/domains/imports/analyze";
import { processImportJob } from "../src/domains/imports/service";
import { getObject, storageEnabled } from "../src/services/storage";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

async function main() {
  const [sourceId, userId, ...rest] = process.argv.slice(2);
  if (!sourceId || !userId) {
    console.error("Usage: tsx scripts/reprocess-source.ts <sourceId> <userId> [--archive=<oldImportJobId>]");
    process.exit(1);
  }
  const archiveArg = rest.find((a) => a.startsWith("--archive="));
  const archiveJobId = archiveArg?.split("=")[1];

  const source = await db.source.findUnique({ where: { id: sourceId } });
  if (!source) throw new Error("Source not found");
  if (!source.objectKey || !storageEnabled()) throw new Error("No stored original file for this source");

  console.log(`Fetching stored original: ${source.objectKey}`);
  const buffer = await getObject(source.objectKey);
  const parsed = parseFile(source.filename ?? source.name, buffer);
  console.log(`Parsed ${parsed.rows.length} rows, columns: ${parsed.columns.join(", ")}`);

  const job = await db.importJob.create({
    data: {
      sourceId: source.id,
      status: "MAPPING",
      filename: source.filename,
      fileFormat: source.type.toLowerCase(),
      totalRows: parsed.rows.length,
      createdById: userId,
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
  console.log(`Created ImportJob ${job.id}`);

  const analysis = await analyzeImportJobWithAi(parsed.columns, parsed.rows, source.filename ?? source.name);
  console.log("Analysis summary:", analysis.summary);
  console.log("Detected metadata columns:", analysis.detected.metadataColumns);
  console.log("Text column:", analysis.detected.textColumn);

  const mapping = toImportMapping(analysis);
  await db.importJob.update({ where: { id: job.id }, data: { mapping: mapping as unknown as Prisma.InputJsonValue } });

  console.log("Processing...");
  const result = await processImportJob(job.id, userId);
  console.log("Result:", {
    status: result.status,
    accepted: result.accepted,
    matched: result.matched,
    conflicts: result.conflicts,
    semanticCandidates: result.semanticCandidates,
    errors: result.errors,
  });

  if (archiveJobId) {
    console.log(`Archiving unverified records from old job ${archiveJobId}...`);
    const rows = await db.importRow.findMany({ where: { jobId: archiveJobId, entityId: { not: null } }, select: { entityType: true, entityId: true } });
    let archivedExpressions = 0;
    let archivedSentences = 0;
    for (const row of rows) {
      if (!row.entityId) continue;
      if (row.entityType === "expression") {
        const before = await db.expression.findUnique({ where: { id: row.entityId } });
        if (!before || before.verification === "VERIFIED" || before.status !== "ACTIVE") continue;
        await db.expression.update({ where: { id: row.entityId }, data: { status: "ARCHIVED" } });
        archivedExpressions++;
      } else if (row.entityType === "sentence") {
        const before = await db.sentence.findUnique({ where: { id: row.entityId } });
        if (!before || before.verification === "VERIFIED" || before.status !== "ACTIVE") continue;
        await db.sentence.update({ where: { id: row.entityId }, data: { status: "ARCHIVED" } });
        archivedSentences++;
      }
    }
    console.log(`Archived ${archivedExpressions} expression(s), ${archivedSentences} sentence(s).`);
  }

  console.log(`\nDone. New job id: ${job.id}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
