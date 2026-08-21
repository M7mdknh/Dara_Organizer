/**
 * Re-runs deep linguistic extraction (src/domains/linguistics/extraction.ts)
 * for every ACTIVE sentence of a source, bypassing the idempotency check
 * (force). Used after a pipeline enhancement (e.g. adding intent/register/
 * naturalness/meaning enrichment) to backfill sentences that were already
 * extracted once under the older logic. Safe to re-run: expression/concept
 * linking uses upsert throughout, so it never creates duplicates.
 *
 * Usage: tsx scripts/reenrich-source.ts <sourceId>
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { extractLinguisticKnowledge } from "../src/domains/linguistics/extraction";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

async function main() {
  const sourceId = process.argv[2];
  if (!sourceId) throw new Error("Usage: tsx scripts/reenrich-source.ts <sourceId>");

  const sentences = await db.sentence.findMany({ where: { sourceId, status: "ACTIVE" }, select: { id: true, textOriginal: true } });
  console.log(`Re-enriching ${sentences.length} sentences for source ${sourceId}`);

  let completed = 0;
  let skipped = 0;
  let errors = 0;
  for (const s of sentences) {
    try {
      const result = await extractLinguisticKnowledge(s.id, { force: true });
      if (result.status === "completed") completed++;
      else skipped++;
      if ((completed + skipped + errors) % 10 === 0) {
        console.log(`  ${completed + skipped + errors}/${sentences.length}...`);
      }
    } catch (err) {
      errors++;
      console.error(`  Error on "${s.textOriginal.slice(0, 40)}": ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(`\nDone. completed=${completed} skipped=${skipped} errors=${errors}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
