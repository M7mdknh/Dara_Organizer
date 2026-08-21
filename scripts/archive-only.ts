import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

async function main() {
  const archiveJobId = process.argv[2];
  if (!archiveJobId) throw new Error("Usage: tsx scripts/archive-only.ts <importJobId>");
  const rows = await db.importRow.findMany({ where: { jobId: archiveJobId, entityId: { not: null } }, select: { entityType: true, entityId: true } });
  console.log(`Considering ${rows.length} rows`);
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

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
