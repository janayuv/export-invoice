import { describe, it, expect, beforeEach } from "vitest";
import { getStoredDensity, setStoredDensity, DEFAULT_UI_DENSITY, UI_DENSITY_KEY } from "@/lib/uiDensity";

describe("getStoredDensity", () => {
  beforeEach(() => localStorage.clear());

  it("returns default when nothing stored", () => {
    expect(getStoredDensity()).toBe(DEFAULT_UI_DENSITY);
  });

  it("returns stored dense", () => {
    localStorage.setItem(UI_DENSITY_KEY, "dense");
    expect(getStoredDensity()).toBe("dense");
  });

  it("returns stored comfortable", () => {
    localStorage.setItem(UI_DENSITY_KEY, "comfortable");
    expect(getStoredDensity()).toBe("comfortable");
  });

  it("returns default for unrecognised value", () => {
    localStorage.setItem(UI_DENSITY_KEY, "unknown");
    expect(getStoredDensity()).toBe(DEFAULT_UI_DENSITY);
  });
});

describe("setStoredDensity", () => {
  beforeEach(() => localStorage.clear());

  it("persists dense to localStorage", () => {
    setStoredDensity("dense");
    expect(localStorage.getItem(UI_DENSITY_KEY)).toBe("dense");
  });

  it("persists comfortable to localStorage", () => {
    setStoredDensity("comfortable");
    expect(localStorage.getItem(UI_DENSITY_KEY)).toBe("comfortable");
  });

  it("round-trips through getStoredDensity", () => {
    setStoredDensity("comfortable");
    expect(getStoredDensity()).toBe("comfortable");
  });
});
