import { describe, it, expect } from "vitest";
import { fnv1a, assignSplits } from "./service";

describe("fnv1a", () => {
  it("is deterministic for the same input", () => {
    expect(fnv1a("abc:42")).toBe(fnv1a("abc:42"));
  });

  it("differs for different inputs (no trivial collisions on similar keys)", () => {
    expect(fnv1a("abc:42")).not.toBe(fnv1a("abd:42"));
  });
});

describe("assignSplits", () => {
  it("keeps every member of a family in the same split (leakage protection)", () => {
    const families = [
      { groupKey: "group-A", memberIds: ["a1", "a2", "a3", "a4", "a5"] },
      { groupKey: "group-B", memberIds: ["b1", "b2"] },
      { groupKey: "group-C", memberIds: ["c1"] },
    ];
    const splits = assignSplits(families, { train: 0.7, validation: 0.15, test: 0.15, seed: 1, groupBy: "utteranceGroup" });

    for (const family of families) {
      const assigned = new Set(family.memberIds.map((id) => splits.get(id)));
      expect(assigned.size).toBe(1); // every member of the family got the same split
    }
  });

  it("is reproducible given the same seed", () => {
    const families = [
      { groupKey: "x", memberIds: ["1"] },
      { groupKey: "y", memberIds: ["2"] },
      { groupKey: "z", memberIds: ["3"] },
      { groupKey: "w", memberIds: ["4"] },
    ];
    const strategy = { train: 0.5, validation: 0.25, test: 0.25, seed: 7, groupBy: "utteranceGroup" as const };
    const first = assignSplits(families, strategy);
    const second = assignSplits(families, strategy);
    expect([...first.entries()]).toEqual([...second.entries()]);
  });

  it("assigns every member to some split and covers all three splits when data allows", () => {
    const families = Array.from({ length: 30 }, (_, i) => ({ groupKey: `g${i}`, memberIds: [`m${i}`] }));
    const splits = assignSplits(families, { train: 0.6, validation: 0.2, test: 0.2, seed: 3, groupBy: "none" });
    expect(splits.size).toBe(30);
    const values = new Set(splits.values());
    expect(values.has("TRAIN")).toBe(true);
    expect(values.has("VALIDATION")).toBe(true);
    expect(values.has("TEST")).toBe(true);
  });

  it("rejects a split strategy that sums to zero", () => {
    expect(() =>
      assignSplits([{ groupKey: "a", memberIds: ["1"] }], { train: 0, validation: 0, test: 0, seed: 1, groupBy: "none" }),
    ).toThrow();
  });
});
