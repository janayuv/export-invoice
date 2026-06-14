import { describe, it, expect } from "vitest";
import { toggleSort, compareStrings, compareNumbers, isDateInRange } from "@/lib/listUtils";

describe("toggleSort", () => {
  it("starts asc when switching to new key", () => {
    expect(toggleSort("name", "asc", "date")).toEqual({ key: "date", dir: "asc" });
  });

  it("flips asc→desc on same key", () => {
    expect(toggleSort("name", "asc", "name")).toEqual({ key: "name", dir: "desc" });
  });

  it("flips desc→asc on same key", () => {
    expect(toggleSort("name", "desc", "name")).toEqual({ key: "name", dir: "asc" });
  });

  it("starts asc when currentKey is null", () => {
    expect(toggleSort(null, "asc", "amount")).toEqual({ key: "amount", dir: "asc" });
  });
});

describe("compareStrings", () => {
  it("returns negative when a < b", () => {
    expect(compareStrings("apple", "banana")).toBeLessThan(0);
  });

  it("returns positive when a > b", () => {
    expect(compareStrings("zebra", "apple")).toBeGreaterThan(0);
  });

  it("returns 0 for equal strings", () => {
    expect(compareStrings("same", "same")).toBe(0);
  });

  it("is case-insensitive", () => {
    expect(compareStrings("Apple", "apple")).toBe(0);
  });
});

describe("compareNumbers", () => {
  it("returns negative when a < b", () => {
    expect(compareNumbers(1, 2)).toBeLessThan(0);
  });

  it("returns positive when a > b", () => {
    expect(compareNumbers(5, 3)).toBeGreaterThan(0);
  });

  it("returns 0 for equal values", () => {
    expect(compareNumbers(7, 7)).toBe(0);
  });
});

describe("isDateInRange", () => {
  it("returns true when date is within range", () => {
    expect(isDateInRange("2025-06-15", "2025-06-01", "2025-06-30")).toBe(true);
  });

  it("returns true for exact boundary dates", () => {
    expect(isDateInRange("2025-06-01", "2025-06-01", "2025-06-30")).toBe(true);
    expect(isDateInRange("2025-06-30", "2025-06-01", "2025-06-30")).toBe(true);
  });

  it("returns false when date is before from", () => {
    expect(isDateInRange("2025-05-31", "2025-06-01", "2025-06-30")).toBe(false);
  });

  it("returns false when date is after to", () => {
    expect(isDateInRange("2025-07-01", "2025-06-01", "2025-06-30")).toBe(false);
  });

  it("ignores empty from bound", () => {
    expect(isDateInRange("2020-01-01", "", "2025-12-31")).toBe(true);
  });

  it("ignores empty to bound", () => {
    expect(isDateInRange("2030-01-01", "2025-01-01", "")).toBe(true);
  });

  it("returns true when both bounds empty", () => {
    expect(isDateInRange("2025-06-15", "", "")).toBe(true);
  });
});
