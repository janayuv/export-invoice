import { describe, it, expect } from "vitest";
import {
  formatInvoiceDisplayDate,
  rateColumnLabel,
  fmtAmount,
  amountInWords,
} from "@/lib/invoiceDocument";

describe("formatInvoiceDisplayDate", () => {
  it("converts YYYY-MM-DD to DD.MM.YYYY", () => {
    expect(formatInvoiceDisplayDate("2025-03-01")).toBe("01.03.2025");
    expect(formatInvoiceDisplayDate("2024-12-31")).toBe("31.12.2024");
    expect(formatInvoiceDisplayDate("2026-01-09")).toBe("09.01.2026");
  });

  it("returns original string when format is unrecognised", () => {
    expect(formatInvoiceDisplayDate("not-a-date")).toBe("not-a-date");
  });
});

describe("rateColumnLabel", () => {
  it("prefixes incoterm when set", () => {
    expect(rateColumnLabel("EXW", "USD")).toBe("EXW USD");
    expect(rateColumnLabel("FOB", "EUR")).toBe("FOB EUR");
    expect(rateColumnLabel("CIF", "GBP")).toBe("CIF GBP");
  });

  it("returns only currency when incoterm is empty", () => {
    expect(rateColumnLabel("", "USD")).toBe("USD");
    expect(rateColumnLabel("   ", "INR")).toBe("INR");
  });
});

describe("fmtAmount", () => {
  it("formats to 2 decimal places by default", () => {
    expect(fmtAmount(1234.5)).toBe("1,234.50");
    expect(fmtAmount(0)).toBe("0.00");
    expect(fmtAmount(1000000)).toBe("1,000,000.00");
  });

  it("respects custom decimal count", () => {
    expect(fmtAmount(1.23456, 4)).toBe("1.2346");
    expect(fmtAmount(84, 0)).toBe("84");
  });
});

describe("amountInWords", () => {
  it("USD — whole dollars only", () => {
    expect(amountInWords(5, "USD")).toBe("FIVE US DOLLAR ONLY");
    expect(amountInWords(1000, "USD")).toBe("ONE THOUSAND US DOLLAR ONLY");
  });

  it("USD — dollars and cents", () => {
    expect(amountInWords(5.5, "USD")).toBe("FIVE US DOLLAR AND FIFTY CENTS ONLY");
    expect(amountInWords(1.01, "USD")).toBe("ONE US DOLLAR AND ONE CENTS ONLY");
  });

  it("GBP uses POUND STERLING / PENCE", () => {
    expect(amountInWords(2.25, "GBP")).toBe("TWO POUND STERLING AND TWENTY FIVE PENCE ONLY");
  });

  it("INR uses INDIAN RUPEE / PAISE", () => {
    expect(amountInWords(100.50, "INR")).toBe("ONE HUNDRED INDIAN RUPEE AND FIFTY PAISE ONLY");
  });

  it("AED uses UAE DIRHAM / FILS", () => {
    expect(amountInWords(10, "AED")).toBe("TEN UAE DIRHAM ONLY");
  });

  it("falls back to currency code for unknown currencies", () => {
    const result = amountInWords(1, "XYZ");
    expect(result).toContain("XYZ");
    expect(result).toContain("ONLY");
  });
});
