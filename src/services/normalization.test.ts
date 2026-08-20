import { describe, it, expect } from "vitest";
import { normalizeArabic, isExactMatch, isNormalizedMatch, containsArabic } from "./normalization";

// Every Arabic string here is built from explicit \uXXXX escapes rather than
// literal glyphs, so the exact codepoints under test are unambiguous and
// immune to transcription mistakes when this file is edited.
const ALIF = "ا";
const LAM = "ل";
const HHA = "ح";
const YEH = "ي";
const NOON = "ن";
const ALIF_MADDA = "آ";
const DAL = "د";
const FATHATAN = "ً"; // combining diacritic

const AL_HEEN = ALIF + LAM + HHA + YEH + NOON; // Najdi "now"
const AL_AAN = ALIF + LAM + ALIF_MADDA + NOON; // MSA "now"
const DA_HEEN = DAL + HHA + YEH + NOON; // Jeddawi "now"
const TATWEEL = "ـ";

describe("normalizeArabic", () => {
  it("preserves plain Arabic consonants without dropping any letters", () => {
    // Regression test: an earlier bug in a hand-written diacritics regex
    // matched an inverted codepoint range and silently deleted every base
    // Arabic letter. This must never happen again.
    expect(normalizeArabic(AL_HEEN)).toBe(AL_HEEN);
    expect(normalizeArabic(DA_HEEN)).toBe(DA_HEEN);
    expect(normalizeArabic(AL_HEEN).length).toBeGreaterThan(0);
  });

  it("strips harmless diacritics without touching base letters", () => {
    const withDiacritic = ALIF + LAM + ALIF_MADDA + FATHATAN + NOON;
    expect(normalizeArabic(withDiacritic)).toBe(normalizeArabic(AL_AAN));
  });

  it("removes tatweel elongation", () => {
    const elongated = ALIF + TATWEEL + LAM + HHA + YEH + NOON;
    expect(normalizeArabic(elongated)).toBe(AL_HEEN);
  });

  it("unifies alif/hamza variants for matching", () => {
    expect(normalizeArabic(AL_AAN)).toBe(normalizeArabic(ALIF + LAM + ALIF + NOON));
  });

  it("collapses whitespace and punctuation, and lowercases Latin text", () => {
    expect(normalizeArabic("  Hello,   WORLD!  ")).toBe("hello world");
  });

  it("does not collapse two genuinely different dialect words to the same key", () => {
    expect(normalizeArabic(AL_HEEN)).not.toBe(normalizeArabic(DA_HEEN));
  });
});

describe("isExactMatch / isNormalizedMatch", () => {
  it("treats identical strings as an exact match", () => {
    expect(isExactMatch(AL_HEEN, AL_HEEN)).toBe(true);
  });

  it("treats diacritic-only differences as a normalized match but not exact", () => {
    const withDiacritic = AL_HEEN + FATHATAN;
    expect(isExactMatch(AL_HEEN, withDiacritic)).toBe(false);
    expect(isNormalizedMatch(AL_HEEN, withDiacritic)).toBe(true);
  });

  it("does not match genuinely different dialect words", () => {
    expect(isNormalizedMatch(AL_HEEN, DA_HEEN)).toBe(false);
  });
});

describe("containsArabic", () => {
  it("detects Arabic script", () => {
    expect(containsArabic(AL_HEEN)).toBe(true);
    expect(containsArabic("now")).toBe(false);
  });
});
