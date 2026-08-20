import { describe, it, expect } from "vitest";
import { diffFields } from "./revisions";

describe("diffFields", () => {
  it("only includes fields that actually changed", () => {
    const before = { name: "Najdi", enabled: true, sortOrder: 1 };
    const after = { name: "Najdi", enabled: false, sortOrder: 1 };
    const { oldDiff, newDiff } = diffFields(before, after);
    expect(Object.keys(newDiff)).toEqual(["enabled"]);
    expect(oldDiff.enabled).toBe(true);
    expect(newDiff.enabled).toBe(false);
  });

  it("returns empty diffs when nothing changed", () => {
    const obj = { a: 1, b: "x" };
    const { oldDiff, newDiff } = diffFields(obj, { ...obj });
    expect(Object.keys(oldDiff)).toHaveLength(0);
    expect(Object.keys(newDiff)).toHaveLength(0);
  });

  it("captures newly added and removed fields", () => {
    const before = { a: 1 };
    const after = { a: 1, b: 2 };
    const { oldDiff, newDiff } = diffFields(before, after);
    expect(newDiff.b).toBe(2);
    expect(oldDiff.b).toBe(null);
  });
});
