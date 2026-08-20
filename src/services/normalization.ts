/**
 * Arabic-aware text normalization for search and deterministic matching.
 *
 * Normalized forms are stored alongside — never instead of — the original
 * text. Rules are deterministic and intentionally conservative: they remove
 * presentation-level noise (diacritics, tatweel, punctuation, whitespace,
 * Unicode form differences) and unify common orthographic variants used
 * interchangeably in informal Arabic writing (alef/hamza forms, final
 * yaa/alef-maksura, taa-marbuta/haa). They must not collapse linguistically
 * meaningful distinctions beyond these well-known search conventions.
 */

// Arabic combining marks: harakat, quranic annotation marks, superscript alef
const ARABIC_DIACRITICS =
  /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۤۧۨ-ۭ]/g;
const TATWEEL = /ـ/g;
const PUNCTUATION =
  /[.,;:!?،؛؟…"'«»()\[\]{}\-_/\\~`|@#$%^&*+=<>٪]/g;

/** Normalize for search/matching. Deterministic; original text is preserved elsewhere. */
export function normalizeArabic(input: string): string {
  let s = input.normalize("NFC");
  s = s.replace(ARABIC_DIACRITICS, "");
  s = s.replace(TATWEEL, "");
  // Alef variants (madda, hamza above/below, wasla) → bare alef
  s = s.replace(/[آأإٱ]/g, "ا");
  // Alef maksura → yaa
  s = s.replace(/ى/g, "ي");
  // Taa marbuta → haa
  s = s.replace(/ة/g, "ه");
  // Hamza on waw / hamza on yaa → carrier letter
  s = s.replace(/ؤ/g, "و");
  s = s.replace(/ئ/g, "ي");
  s = s.replace(PUNCTUATION, " ");
  s = s.toLowerCase();
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/** True when two raw strings are identical after harmless normalization. */
export function isNormalizedMatch(a: string, b: string): boolean {
  return normalizeArabic(a) === normalizeArabic(b);
}

/** True when the difference is ONLY presentation-level (safe deterministic duplicate). */
export function isExactMatch(a: string, b: string): boolean {
  return a.normalize("NFC").trim() === b.normalize("NFC").trim();
}

export function containsArabic(s: string): boolean {
  return /[؀-ۿ]/.test(s);
}
