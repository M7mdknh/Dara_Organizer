import { describe, it, expect } from "vitest";
import { isMetadataValue, classifyColumns, guessColumnMapping, pickRichestColumn } from "./analyze";

describe("isMetadataValue", () => {
  it("recognizes subtitle-style timestamp offsets", () => {
    for (const v of ["0s", "6s", "11s", "16s", "22s", "31s", "1.5s"]) {
      expect(isMetadataValue(v)).toBe(true);
    }
  });

  it("recognizes clock timestamps and SRT cue ranges", () => {
    expect(isMetadataValue("01:24")).toBe(true);
    expect(isMetadataValue("00:01:35")).toBe(true);
    expect(isMetadataValue("00:01:35,120")).toBe(true);
    expect(isMetadataValue("00:01:35,120 --> 00:01:37,500")).toBe(true);
  });

  it("recognizes bare sequence numbers and row ids", () => {
    expect(isMetadataValue("1")).toBe(true);
    expect(isMetadataValue("42")).toBe(true);
    expect(isMetadataValue("#7")).toBe(true);
    expect(isMetadataValue("[12]")).toBe(true);
  });

  it("does not flag real linguistic text", () => {
    expect(isMetadataValue("وش تبي تسوي الحين؟")).toBe(false);
    expect(isMetadataValue("What do you want to do now?")).toBe(false);
    expect(isMetadataValue("الحين")).toBe(false);
  });
});

describe("classifyColumns — the reported Language Reactor bug", () => {
  const columns = ["timestamp", "arabic", "english"];
  const rows = [
    { timestamp: "0s", arabic: "هو لبس ثوب وكان في حالة نجاسة", english: "He wore a garment and was in a state of ritual impurity" },
    { timestamp: "6s", arabic: "ولعله ذهب ونسي أن يرجع", english: "And perhaps he went and forgot to return" },
    { timestamp: "11s", arabic: "وش تبي تسوي الحين؟", english: "What do you want to do now?" },
    { timestamp: "16s", arabic: "لا أدري والله", english: "I don't know, I swear" },
  ];
  const stats = classifyColumns(columns, rows);

  it("flags the timestamp column as metadata", () => {
    expect(stats.get("timestamp")!.isMetadataLike).toBe(true);
  });

  it("does not flag the Arabic or English text columns as metadata", () => {
    expect(stats.get("arabic")!.isMetadataLike).toBe(false);
    expect(stats.get("english")!.isMetadataLike).toBe(false);
  });

  it("column-name keyword mapping never selects the metadata column as text once excluded", () => {
    const linguisticColumns = columns.filter((c) => !stats.get(c)!.isMetadataLike);
    const mapping = guessColumnMapping(linguisticColumns, "sentence");
    expect(mapping.text).not.toBe("timestamp");
    expect(["arabic", "english"]).toContain(mapping.text);
  });
});

describe("pickRichestColumn — English translation must never be mistaken for the Arabic original", () => {
  it("prefers a short Arabic column over a longer unlabeled English column", () => {
    const columns = ["col1", "col2"];
    const rows = [
      { col1: "وش تبي", col2: "What do you want to do, exactly, right now, in this moment?" },
      { col1: "كيف حالك", col2: "How are you doing today, my friend? I hope everything is fine." },
    ];
    const stats = classifyColumns(columns, rows);
    expect(pickRichestColumn(columns, stats)).toBe("col1");
  });
});

describe("classifyColumns — unlabeled metadata column (no header keyword at all)", () => {
  it("still excludes a pure-sequence-number first column even without a 'text' header anywhere", () => {
    const columns = ["col1", "col2"];
    const rows = [
      { col1: "1", col2: "الحمدلله بخير" },
      { col1: "2", col2: "وش أخبارك اليوم؟" },
      { col1: "3", col2: "كله تمام والحمدلله" },
    ];
    const stats = classifyColumns(columns, rows);
    expect(stats.get("col1")!.isMetadataLike).toBe(true);
    expect(stats.get("col2")!.isMetadataLike).toBe(false);
  });
});
