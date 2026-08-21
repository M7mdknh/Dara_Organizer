/**
 * Targeted cleanup: archives (never deletes) Sentence rows for a given
 * source whose textOriginal is itself a timestamp/sequence value (the exact
 * bug pattern — "0s", "6s", "11s", ...), only when still UNVERIFIED. Used
 * when the originating ImportRow lineage for the bad job is no longer
 * available to key off of directly.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { isMetadataValue } from "../src/domains/imports/analyze";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

async function main() {
  const sourceId = process.argv[2];
  if (!sourceId) throw new Error("Usage: tsx scripts/archive-bad-sentences.ts <sourceId>");
  const sentences = await db.sentence.findMany({ where: { sourceId, status: "ACTIVE" } });
  let archived = 0;
  for (const s of sentences) {
    if (s.verification === "VERIFIED") continue;
    if (!isMetadataValue(s.textOriginal)) continue;
    await db.sentence.update({ where: { id: s.id }, data: { status: "ARCHIVED" } });
    console.log(`Archived: "${s.textOriginal}"`);
    archived++;
  }
  console.log(`\nArchived ${archived} of ${sentences.length} sentences for source ${sourceId}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
