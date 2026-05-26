import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @/lib/db before any module that imports it is loaded.
vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
  withTransaction: vi.fn((_db: unknown, fn: () => Promise<unknown>) => fn()),
}));

import { generateInvoiceNumber } from "@/hooks/useInvoices";
import { previewPONumber } from "@/hooks/usePurchaseOrders";
import { getDb } from "@/lib/db";

function makeDb(selectResult: unknown[], executeResult = {}) {
  return {
    select: vi.fn().mockResolvedValue(selectResult),
    execute: vi.fn().mockResolvedValue(executeResult),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateInvoiceNumber (read-only preview)", () => {
  it("returns EXP/5/2025-26 when last_number=4", async () => {
    const db = makeDb([{ last_number: 4 }]);
    vi.mocked(getDb).mockResolvedValue(db as never);

    const result = await generateInvoiceNumber(new Date("2025-06-01"));

    expect(result).toBe("EXP/5/2025-26");
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("returns EXP/1/2025-26 when no row exists yet", async () => {
    const db = makeDb([]);
    vi.mocked(getDb).mockResolvedValue(db as never);

    const result = await generateInvoiceNumber(new Date("2025-06-01"));

    expect(result).toBe("EXP/1/2025-26");
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("uses current fiscal year (Apr–Mar boundary)", async () => {
    const db = makeDb([{ last_number: 0 }]);
    vi.mocked(getDb).mockResolvedValue(db as never);

    // March → previous FY
    const march = await generateInvoiceNumber(new Date("2026-03-31"));
    expect(march).toBe("EXP/1/2025-26");

    // April → new FY
    const april = await generateInvoiceNumber(new Date("2026-04-01"));
    expect(april).toBe("EXP/1/2026-27");
  });
});

describe("previewPONumber (read-only preview)", () => {
  it("returns PO/3/2025-26 when last_number=2", async () => {
    const db = makeDb([{ last_number: 2 }]);
    vi.mocked(getDb).mockResolvedValue(db as never);

    const result = await previewPONumber(new Date("2025-06-01"));

    expect(result).toBe("PO/3/2025-26");
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("returns PO/1/2025-26 when no sequence row exists", async () => {
    const db = makeDb([]);
    vi.mocked(getDb).mockResolvedValue(db as never);

    const result = await previewPONumber(new Date("2025-06-01"));

    expect(result).toBe("PO/1/2025-26");
    expect(db.execute).not.toHaveBeenCalled();
  });
});
