/**
 * Predefined language metadata for the "Add Language" autocomplete. This is
 * NOT the source of truth for enabled languages (the Language table is) —
 * it only saves a user from manually typing native name/script/direction
 * for a well-known language. Advanced editing after adding remains available.
 */

export interface LanguageCatalogEntry {
  code: string; // ISO 639-1 where available
  name: string;
  nativeName: string;
  script: string;
  direction: "ltr" | "rtl";
}

export const LANGUAGE_CATALOG: LanguageCatalogEntry[] = [
  { code: "ar", name: "Arabic", nativeName: "العربية", script: "Arabic", direction: "rtl" },
  { code: "ar-MSA", name: "Modern Standard Arabic", nativeName: "العربية الفصحى", script: "Arabic", direction: "rtl" },
  { code: "en", name: "English", nativeName: "English", script: "Latin", direction: "ltr" },
  { code: "fr", name: "French", nativeName: "Français", script: "Latin", direction: "ltr" },
  { code: "es", name: "Spanish", nativeName: "Español", script: "Latin", direction: "ltr" },
  { code: "de", name: "German", nativeName: "Deutsch", script: "Latin", direction: "ltr" },
  { code: "it", name: "Italian", nativeName: "Italiano", script: "Latin", direction: "ltr" },
  { code: "pt", name: "Portuguese", nativeName: "Português", script: "Latin", direction: "ltr" },
  { code: "tr", name: "Turkish", nativeName: "Türkçe", script: "Latin", direction: "ltr" },
  { code: "fa", name: "Persian", nativeName: "فارسی", script: "Arabic", direction: "rtl" },
  { code: "ur", name: "Urdu", nativeName: "اردو", script: "Arabic", direction: "rtl" },
  { code: "he", name: "Hebrew", nativeName: "עברית", script: "Hebrew", direction: "rtl" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", script: "Devanagari", direction: "ltr" },
  { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia", script: "Latin", direction: "ltr" },
  { code: "ms", name: "Malay", nativeName: "Bahasa Melayu", script: "Latin", direction: "ltr" },
  { code: "ru", name: "Russian", nativeName: "Русский", script: "Cyrillic", direction: "ltr" },
  { code: "zh", name: "Chinese (Mandarin)", nativeName: "中文", script: "Han", direction: "ltr" },
  { code: "ja", name: "Japanese", nativeName: "日本語", script: "Japanese", direction: "ltr" },
  { code: "ko", name: "Korean", nativeName: "한국어", script: "Hangul", direction: "ltr" },
  { code: "sw", name: "Swahili", nativeName: "Kiswahili", script: "Latin", direction: "ltr" },
  { code: "nl", name: "Dutch", nativeName: "Nederlands", script: "Latin", direction: "ltr" },
];

export function findInCatalog(query: string): LanguageCatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return LANGUAGE_CATALOG;
  return LANGUAGE_CATALOG.filter(
    (l) => l.name.toLowerCase().includes(q) || l.nativeName.toLowerCase().includes(q) || l.code.toLowerCase() === q,
  );
}
