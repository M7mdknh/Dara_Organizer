/**
 * Demo seed data for the Arabic Dialect Data Platform.
 * All linguistic content here is clearly demo/reference data (Source "Demo seed data").
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { normalizeArabic as norm } from "../src/services/normalization";
import { seedLanguagesAndDialects } from "../src/domains/taxonomy/seed-taxonomy";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

async function main() {
  // Hard block: this script seeds well-known demo credentials
  // (admin@example.com / password123) and clearly-labeled sample linguistic
  // data. It must never run against a production database — use
  // `npm run admin:create` to bootstrap the first real production Admin
  // account instead (see scripts/create-admin.ts).
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to run prisma/seed.ts with NODE_ENV=production. " +
        "This script creates public demo credentials (admin@example.com/password123) and demo data, " +
        "which must never exist in production. Use `npm run admin:create` instead.",
    );
  }

  console.log("Seeding demo data…");

  // --- Users ---
  const passwordHash = await bcrypt.hash("password123", 10);
  const admin = await db.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: { email: "admin@example.com", name: "Admin User", role: "ADMIN", passwordHash },
  });
  await db.user.upsert({
    where: { email: "editor@example.com" },
    update: {},
    create: { email: "editor@example.com", name: "Editor User", role: "EDITOR", passwordHash },
  });
  await db.user.upsert({
    where: { email: "reviewer@example.com" },
    update: {},
    create: { email: "reviewer@example.com", name: "Reviewer User", role: "REVIEWER", passwordHash },
  });
  await db.user.upsert({
    where: { email: "viewer@example.com" },
    update: {},
    create: { email: "viewer@example.com", name: "Viewer User", role: "VIEWER", passwordHash },
  });

  // --- Languages & dialect hierarchy (shared, production-safe taxonomy) ---
  const { languages, dialects } = await seedLanguagesAndDialects(db);
  const { msaDialect, najdi, jeddawi, syrian } = dialects;

  // --- Taxonomies ---
  for (const t of ["Food & Drink", "Daily Life", "Emotions", "Time", "Conversation"]) {
    await db.topic.upsert({ where: { name: t }, update: {}, create: { name: t } });
  }
  const intentNames = ["ASK_WELLBEING", "REQUEST", "GREETING", "THANKS", "PRAISE_RESPONSE"];
  const intents: Record<string, string> = {};
  for (const n of intentNames) {
    intents[n] = (await db.intent.upsert({ where: { name: n }, update: {}, create: { name: n } })).id;
  }
  const situationNames = ["Home", "Restaurant", "Majlis", "Street", "Phone call"];
  const situations: Record<string, string> = {};
  for (const n of situationNames) {
    situations[n] = (await db.situation.upsert({ where: { name: n }, update: {}, create: { name: n } })).id;
  }
  const registerNames = ["Formal", "Casual", "Intimate"];
  const registers: Record<string, string> = {};
  for (const n of registerNames) {
    registers[n] = (await db.register.upsert({ where: { name: n }, update: {}, create: { name: n } })).id;
  }
  const functionNames = [
    "Greeting", "Farewell", "Asking wellbeing", "Thanks", "Response to thanks",
    "Praise", "Response to praise", "Apology", "Response to apology", "Request",
    "Acceptance", "Refusal", "Agreement", "Disagreement", "Surprise",
    "Confirmation", "Clarification", "Question", "Follow-up question", "Humor",
    "Sympathy", "Congratulations", "Condolences", "Hospitality", "Small talk",
    "Filler", "Interruption", "Acknowledgment",
  ];
  for (const n of functionNames) {
    await db.conversationalFunction.upsert({ where: { name: n }, update: {}, create: { name: n } });
  }
  const greetingFn = await db.conversationalFunction.findUnique({ where: { name: "Greeting" } });
  const wellbeingFn = await db.conversationalFunction.findUnique({ where: { name: "Asking wellbeing" } });
  const praiseRespFn = await db.conversationalFunction.findUnique({ where: { name: "Response to praise" } });

  // --- Categories ---
  const conversationCat = await db.category.upsert({ where: { id: "seed-cat-conversation" }, update: {}, create: { id: "seed-cat-conversation", name: "Conversation" } });
  await db.category.upsert({ where: { id: "seed-cat-greetings" }, update: {}, create: { id: "seed-cat-greetings", name: "Greetings", parentId: conversationCat.id } });
  const hospitalityCat = await db.category.upsert({ where: { id: "seed-cat-hospitality" }, update: {}, create: { id: "seed-cat-hospitality", name: "Hospitality" } });

  // --- Source ---
  const source = await db.source.upsert({
    where: { id: "seed-source-demo" },
    update: {},
    create: { id: "seed-source-demo", name: "Demo seed data", type: "MANUAL", description: "Clearly-labeled demo/reference data seeded for platform evaluation. Not production training data.", createdById: admin.id, defaultTraining: "UNDECIDED" },
  });

  // --- Concept: TIME_NOW ---
  const nowConcept = await db.concept.upsert({
    where: { key: "TIME_NOW" },
    update: {},
    create: { key: "TIME_NOW", gloss: "at the present time", origin: "HUMAN", sourceId: source.id },
  });

  async function expr(text: string, languageId: string, dialectId: string | null, opts: { concept?: string; quality?: "GOLD" | "SILVER"; verified?: boolean; commonness?: string } = {}) {
    const e = await db.expression.create({
      data: {
        textOriginal: text,
        textNormalized: norm(text),
        languageId,
        dialectId,
        quality: opts.quality ?? "GOLD",
        verification: opts.verified === false ? "UNVERIFIED" : "VERIFIED",
        verifiedById: opts.verified === false ? null : admin.id,
        verifiedAt: opts.verified === false ? null : new Date(),
        training: "ELIGIBLE",
        origin: "HUMAN",
        sourceId: source.id,
        commonness: (opts.commonness as never) ?? "HIGH",
      },
    });
    if (opts.concept) {
      await db.conceptExpression.create({ data: { conceptId: opts.concept, expressionId: e.id } });
    }
    return e;
  }

  const nowMsa = await expr("الآن", languages["ar-MSA"], msaDialect.id, { concept: nowConcept.id, commonness: "HIGH" });
  const nowNajdi = await expr("الحين", languages.ar, najdi.id, { concept: nowConcept.id, commonness: "VERY_HIGH" });
  const nowJeddawi = await expr("دحين", languages.ar, jeddawi.id, { concept: nowConcept.id, commonness: "VERY_HIGH" });
  const nowSyrian = await expr("هلأ", languages.ar, syrian.id, { concept: nowConcept.id, commonness: "VERY_HIGH" });
  await expr("now", languages.en, null, { concept: nowConcept.id });
  await expr("maintenant", languages.fr, null, { concept: nowConcept.id });
  await expr("ahora", languages.es, null, { concept: nowConcept.id });
  // synonym within Najdi
  const nowNajdiVariant = await expr("هالحين", languages.ar, najdi.id, { concept: nowConcept.id, commonness: "CONTEXTUAL", quality: "SILVER", verified: false });
  await db.expressionRelation.create({ data: { fromId: nowNajdiVariant.id, toId: nowNajdi.id, type: "REGIONAL_VARIANT", notes: "Contextual/emphatic variant" } });

  await db.pronunciation.create({ data: { expressionId: nowNajdi.id, dialectId: najdi.id, arabicPhonetic: "al-ḥīn", ipa: "alħiːn", origin: "HUMAN", verification: "VERIFIED" } });
  await db.pronunciation.create({ data: { expressionId: nowJeddawi.id, dialectId: jeddawi.id, arabicPhonetic: "da-ḥīn", ipa: "daħiːn", origin: "HUMAN", verification: "VERIFIED" } });

  // --- Equivalent utterance group ---
  const group = await db.utteranceGroup.create({
    data: { name: "Ask what someone wants to do now", meaning: "Asking a person what they'd like to do at the present moment", intentId: intents.REQUEST },
  });
  async function sentence(text: string, languageId: string, dialectId: string | null, meaning: string) {
    return db.sentence.create({
      data: {
        textOriginal: text,
        textNormalized: norm(text),
        languageId,
        dialectId,
        meaning,
        utteranceGroupId: group.id,
        quality: "GOLD",
        verification: "VERIFIED",
        verifiedById: admin.id,
        verifiedAt: new Date(),
        training: "ELIGIBLE",
        naturalness: "NATURAL",
        commonness: "HIGH",
        origin: "HUMAN",
        sourceId: source.id,
      },
    });
  }
  await sentence("وش تبي تسوي الحين؟", languages.ar, najdi.id, "What do you want to do now?");
  await sentence("إيش تبغى تسوي دحين؟", languages.ar, jeddawi.id, "What do you want to do now?");
  await sentence("شو بدك تعمل هلأ؟", languages.ar, syrian.id, "What do you want to do now?");
  await sentence("ماذا تريد أن تفعل الآن؟", languages["ar-MSA"], msaDialect.id, "What do you want to do now?");
  await sentence("What do you want to do now?", languages.en, null, "What do you want to do now?");

  // --- Response patterns ---
  const kafuPattern = await db.responsePattern.create({ data: { name: "Response to كفو (well done)", intentId: intents.PRAISE_RESPONSE } });
  await db.responseTrigger.create({ data: { patternId: kafuPattern.id, textOriginal: "كفو", textNormalized: norm("كفو"), dialectId: najdi.id } });
  await db.responseVariant.createMany({
    data: [
      { patternId: kafuPattern.id, textOriginal: "كفوك الطيب", textNormalized: norm("كفوك الطيب"), dialectId: najdi.id, weight: 40, commonness: "HIGH", quality: "GOLD", verification: "VERIFIED" },
      { patternId: kafuPattern.id, textOriginal: "كفوك العز", textNormalized: norm("كفوك العز"), dialectId: najdi.id, weight: 30, commonness: "MEDIUM", quality: "GOLD", verification: "VERIFIED" },
      { patternId: kafuPattern.id, textOriginal: "تسلم", textNormalized: norm("تسلم"), dialectId: najdi.id, weight: 20, commonness: "HIGH", quality: "SILVER" },
    ],
  });

  const wellbeingPattern = await db.responsePattern.create({ data: { name: "Response to كيف الحال؟", intentId: intents.ASK_WELLBEING } });
  await db.responseTrigger.createMany({
    data: [
      { patternId: wellbeingPattern.id, textOriginal: "كيف حالك؟", textNormalized: norm("كيف حالك؟"), dialectId: msaDialect.id },
      { patternId: wellbeingPattern.id, textOriginal: "كيف الحال؟", textNormalized: norm("كيف الحال؟"), dialectId: najdi.id },
      { patternId: wellbeingPattern.id, textOriginal: "وش حالك؟", textNormalized: norm("وش حالك؟"), dialectId: najdi.id },
    ],
  });
  await db.responseVariant.createMany({
    data: [
      { patternId: wellbeingPattern.id, textOriginal: "الحمدلله بخير", textNormalized: norm("الحمدلله بخير"), dialectId: najdi.id, weight: 40, commonness: "VERY_HIGH", quality: "GOLD", verification: "VERIFIED" },
      { patternId: wellbeingPattern.id, textOriginal: "بخير دامك بخير", textNormalized: norm("بخير دامك بخير"), dialectId: najdi.id, weight: 30, commonness: "HIGH", quality: "GOLD", verification: "VERIFIED" },
      { patternId: wellbeingPattern.id, textOriginal: "تمام، وش علومك؟", textNormalized: norm("تمام، وش علومك؟"), dialectId: najdi.id, weight: 15, commonness: "MEDIUM", quality: "SILVER" },
      { patternId: wellbeingPattern.id, textOriginal: "طيبين ولله الحمد", textNormalized: norm("طيبين ولله الحمد"), dialectId: najdi.id, weight: 10, commonness: "MEDIUM", quality: "SILVER" },
    ],
  });

  // --- Conversation ---
  const conv = await db.conversation.create({
    data: {
      title: "Greeting and wellbeing — Najdi",
      dialectId: najdi.id,
      situationId: situations.Home,
      quality: "GOLD",
      verification: "VERIFIED",
      training: "ELIGIBLE",
      origin: "HUMAN",
      sourceId: source.id,
      categories: { create: [{ categoryId: conversationCat.id }] },
    },
  });
  const turns = [
    ["A", "السلام عليكم", greetingFn?.id],
    ["B", "وعليكم السلام", greetingFn?.id],
    ["A", "كيف حالك؟", wellbeingFn?.id],
    ["B", "بخير دامك بخير، علومك؟", wellbeingFn?.id],
    ["A", "طيبين ولله الحمد", wellbeingFn?.id],
    ["B", "الله يديمها", praiseRespFn?.id],
  ] as const;
  await db.conversationTurn.createMany({
    data: turns.map(([speaker, text, functionId], i) => ({
      conversationId: conv.id,
      orderIndex: i,
      speaker,
      textOriginal: text,
      textNormalized: norm(text),
      dialectId: najdi.id,
      functionId: functionId ?? null,
    })),
  });

  // --- Collection ---
  const collection = await db.collection.upsert({
    where: { name: "Najdi Core (Demo)" },
    update: {},
    create: { name: "Najdi Core (Demo)", description: "Demo collection of core Najdi expressions and sentences" },
  });
  await db.collectionItem.createMany({
    data: [
      { collectionId: collection.id, entityType: "expression", entityId: nowNajdi.id },
      { collectionId: collection.id, entityType: "expression", entityId: nowMsa.id },
    ],
    skipDuplicates: true,
  });
  void hospitalityCat;
  void nowSyrian;

  console.log("Seed complete.");
  console.log("Login: admin@example.com / editor@example.com / reviewer@example.com / viewer@example.com — password: password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
