import type { PrismaClient } from "@prisma/client";

/**
 * Idempotent, production-safe seeding of the predefined language and Arabic
 * dialect taxonomy (upsert by unique code/slug — never creates demo users or
 * demo linguistic content). Safe to run repeatedly and safe to run against
 * production; adding new predefined nodes here and re-running only adds
 * what's missing, it never overwrites human edits to existing nodes (upsert
 * `update: {}` — see each call site).
 */
export async function seedLanguagesAndDialects(db: PrismaClient) {
  const languages: Record<string, string> = {};
  for (const [code, name, nativeName, script, dir] of [
    ["ar", "Arabic", "العربية", "Arabic", "rtl"],
    ["ar-MSA", "Modern Standard Arabic", "العربية الفصحى", "Arabic", "rtl"],
    ["en", "English", "English", "Latin", "ltr"],
    ["fr", "French", "Français", "Latin", "ltr"],
    ["es", "Spanish", "Español", "Latin", "ltr"],
  ] as const) {
    const l = await db.language.upsert({
      where: { code },
      update: {},
      create: { code, name, nativeName, script, direction: dir },
    });
    languages[code] = l.id;
  }

  async function dialect(
    name: string,
    slug: string,
    parentId: string | null,
    opts: { nameAr?: string; region?: string; aiContext?: string } = {},
  ) {
    return db.dialectNode.upsert({
      where: { slug },
      update: {},
      create: { name, slug, parentId, nameAr: opts.nameAr, region: opts.region, aiContext: opts.aiContext },
    });
  }

  const common = await dialect("Common Arabic", "common-arabic", null, {
    aiContext: "Arabic forms used broadly across dialects, not tied to one specific region.",
  });
  const msaDialect = await dialect("MSA", "msa", null, {
    nameAr: "الفصحى",
    aiContext: "Modern Standard Arabic — the formal, written/broadcast register understood across the Arab world.",
  });
  const saudi = await dialect("Saudi", "saudi", common.id, { region: "Saudi Arabia" });
  await dialect("Common Saudi", "common-saudi", saudi.id, { region: "Saudi Arabia" });
  const najdi = await dialect("Najdi", "najdi", saudi.id, {
    nameAr: "نجدي",
    region: "Najd, central Saudi Arabia (Riyadh)",
    aiContext: "Najdi Arabic, spoken in central Saudi Arabia including Riyadh.",
  });
  const hijazi = await dialect("Hijazi", "hijazi", saudi.id, {
    nameAr: "حجازي",
    region: "Hijaz, western Saudi Arabia",
    aiContext: "Hijazi Arabic, spoken in western Saudi Arabia (Jeddah, Mecca, Medina).",
  });
  const jeddawi = await dialect("Jeddawi", "jeddawi", hijazi.id, {
    nameAr: "جداوي",
    region: "Jeddah, Saudi Arabia",
    aiContext: "Jeddawi Arabic — the urban Hijazi dialect spoken in Jeddah.",
  });
  await dialect("Makkawi", "makkawi", hijazi.id, { nameAr: "مكاوي", region: "Mecca, Saudi Arabia" });
  await dialect("Madani", "madani", hijazi.id, { nameAr: "مدني", region: "Medina, Saudi Arabia" });
  await dialect("Eastern (Saudi)", "eastern-saudi", saudi.id, { region: "Eastern Province, Saudi Arabia" });
  const gulf = await dialect("Gulf", "gulf", common.id, { aiContext: "Gulf Arabic (Khaleeji), spoken across the Arabian Gulf states." });
  await dialect("Kuwaiti", "kuwaiti", gulf.id, { region: "Kuwait" });
  await dialect("Emirati", "emirati", gulf.id, { region: "United Arab Emirates" });
  await dialect("Qatari", "qatari", gulf.id, { region: "Qatar" });
  await dialect("Bahraini", "bahraini", gulf.id, { region: "Bahrain" });
  const levantine = await dialect("Levantine", "levantine", common.id, { aiContext: "Levantine Arabic, spoken in Syria, Lebanon, Jordan, and Palestine." });
  const syrian = await dialect("Syrian", "syrian", levantine.id, { nameAr: "سوري", region: "Syria" });
  await dialect("Lebanese", "lebanese", levantine.id, { region: "Lebanon" });
  await dialect("Jordanian", "jordanian", levantine.id, { region: "Jordan" });
  await dialect("Palestinian", "palestinian", levantine.id, { region: "Palestine" });
  await dialect("Egyptian", "egyptian", common.id, { nameAr: "مصري", region: "Egypt" });
  await dialect("Iraqi", "iraqi", common.id, { nameAr: "عراقي", region: "Iraq" });
  const maghrebi = await dialect("Maghrebi", "maghrebi", common.id, { aiContext: "Maghrebi Arabic, spoken across North Africa (Morocco, Algeria, Tunisia)." });
  await dialect("Moroccan", "moroccan", maghrebi.id, { region: "Morocco" });
  await dialect("Algerian", "algerian", maghrebi.id, { region: "Algeria" });
  await dialect("Tunisian", "tunisian", maghrebi.id, { region: "Tunisia" });

  return {
    languages,
    dialects: { common, msaDialect, saudi, najdi, hijazi, jeddawi, gulf, levantine, syrian, maghrebi },
  };
}
