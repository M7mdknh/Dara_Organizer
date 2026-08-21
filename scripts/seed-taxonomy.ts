/**
 * Safe production taxonomy seed: predefined languages (Arabic/MSA/English/
 * French/Spanish) and the Arabic dialect hierarchy. Idempotent (upsert by
 * unique code/slug) and contains no demo users or demo linguistic content,
 * so unlike prisma/seed.ts it is safe to run against production —
 * e.g. after adding new predefined dialect nodes (like Qatari/Bahraini) to
 * src/domains/taxonomy/seed-taxonomy.ts, re-run this to backfill them.
 *
 * Usage: npm run seed:taxonomy
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { seedLanguagesAndDialects } from "../src/domains/taxonomy/seed-taxonomy";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding predefined languages and dialect taxonomy…");
  const { languages, dialects } = await seedLanguagesAndDialects(db);
  console.log(`Languages: ${Object.keys(languages).join(", ")}`);
  console.log(`Dialect roots: ${Object.keys(dialects).join(", ")}`);
  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
