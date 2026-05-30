export type SortDirection = "asc" | "desc";

export function toggleSort<T extends string>(
  currentKey: T | null,
  currentDir: SortDirection,
  nextKey: T
): { key: T; dir: SortDirection } {
  if (currentKey === nextKey) {
    return { key: nextKey, dir: currentDir === "asc" ? "desc" : "asc" };
  }
  return { key: nextKey, dir: "asc" };
}

export function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

export function compareNumbers(a: number, b: number): number {
  return a - b;
}

/** ISO date strings YYYY-MM-DD */
export function isDateInRange(
  isoDate: string,
  from: string,
  to: string
): boolean {
  if (from && isoDate < from) return false;
  if (to && isoDate > to) return false;
  return true;
}
