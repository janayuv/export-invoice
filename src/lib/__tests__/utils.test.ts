import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { relativeTime } from "@/lib/utils";

describe("relativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'just now' for times under 1 hour ago", () => {
    expect(relativeTime("2026-06-15T11:30:00Z")).toBe("just now");
    expect(relativeTime("2026-06-15T11:59:59Z")).toBe("just now");
  });

  it("returns singular hour for exactly 1 hour ago", () => {
    expect(relativeTime("2026-06-15T11:00:00Z")).toBe("1 hour ago");
  });

  it("returns plural hours for 2-23 hours ago", () => {
    expect(relativeTime("2026-06-15T10:00:00Z")).toBe("2 hours ago");
    expect(relativeTime("2026-06-14T13:00:00Z")).toBe("23 hours ago");
  });

  it("returns 'yesterday' for 24-47 hours ago", () => {
    expect(relativeTime("2026-06-14T12:00:00Z")).toBe("yesterday");
    expect(relativeTime("2026-06-14T00:01:00Z")).toBe("yesterday");
  });

  it("returns 'N days ago' for 2+ days ago", () => {
    expect(relativeTime("2026-06-13T12:00:00Z")).toBe("2 days ago");
    expect(relativeTime("2026-06-08T12:00:00Z")).toBe("7 days ago");
  });
});
