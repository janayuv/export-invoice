import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: vi.fn(async () => ({
      select: vi.fn(),
      execute: vi.fn(),
    })),
  },
}));

import { getDb, setDbReadGate, isDbReadGateOpen } from "@/lib/db";

describe("db read gate", () => {
  beforeEach(() => {
    setDbReadGate(false);
  });

  it("blocks getDb when gate is closed", async () => {
    await expect(getDb()).rejects.toThrow(/ERR_SESSION/);
  });

  it("allows bypassGate for pre-auth reads", async () => {
    await expect(getDb({ bypassGate: true })).resolves.toBeDefined();
  });

  it("opens gate after setDbReadGate(true)", async () => {
    setDbReadGate(true);
    expect(isDbReadGateOpen()).toBe(true);
    await expect(getDb()).resolves.toBeDefined();
  });
});
