import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { verifyPin } from "@/lib/auth";

// ── verifyPin lockout edge cases ──────────────────────────────────────────────

describe("verifyPin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns success status on correct PIN", async () => {
    vi.mocked(invoke).mockResolvedValue({
      status: "success",
      user: { id: 1, name: "admin", role: "admin", is_active: true, created_at: "" },
    });
    const result = await verifyPin(1, "1234");
    expect(result.status).toBe("success");
    if (result.status === "success") expect(result.user.role).toBe("admin");
  });

  it("returns failed status with remaining_attempts on wrong PIN", async () => {
    vi.mocked(invoke).mockResolvedValue({
      status: "failed",
      remaining_attempts: 4,
    });
    const result = await verifyPin(1, "9999");
    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.remaining_attempts).toBe(4);
  });

  it("returns locked status when account is locked", async () => {
    vi.mocked(invoke).mockResolvedValue({
      status: "locked",
      until: new Date(Date.now() + 5 * 60_000).toISOString(),
    });
    const result = await verifyPin(1, "0000");
    expect(result.status).toBe("locked");
  });

  it("propagates invoke errors as thrown exceptions", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("ERR_PERMISSION: no session"));
    await expect(verifyPin(1, "1234")).rejects.toThrow("ERR_PERMISSION:");
  });
});

// ── session timeout logic (pure timing checks) ────────────────────────────────

describe("session timeout thresholds", () => {
  const INACTIVITY_MS = 30 * 60_000;
  const ABSOLUTE_MS   = 8 * 60 * 60_000;

  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it("session is valid when within inactivity window", () => {
    const now = Date.now();
    sessionStorage.setItem("last_activity", (now - INACTIVITY_MS + 1000).toString());
    sessionStorage.setItem("session_started", now.toString());
    const lastAct = Number(sessionStorage.getItem("last_activity") ?? 0);
    const started = Number(sessionStorage.getItem("session_started") ?? 0);
    const expired = now - lastAct > INACTIVITY_MS || now - started > ABSOLUTE_MS;
    expect(expired).toBe(false);
  });

  it("session expires after inactivity window", () => {
    const now = Date.now();
    sessionStorage.setItem("last_activity", (now - INACTIVITY_MS - 1).toString());
    sessionStorage.setItem("session_started", now.toString());
    const lastAct = Number(sessionStorage.getItem("last_activity") ?? 0);
    const started = Number(sessionStorage.getItem("session_started") ?? 0);
    const expired = now - lastAct > INACTIVITY_MS || now - started > ABSOLUTE_MS;
    expect(expired).toBe(true);
  });

  it("session expires after absolute window even with recent activity", () => {
    const now = Date.now();
    sessionStorage.setItem("last_activity", now.toString());
    sessionStorage.setItem("session_started", (now - ABSOLUTE_MS - 1).toString());
    const lastAct = Number(sessionStorage.getItem("last_activity") ?? 0);
    const started = Number(sessionStorage.getItem("session_started") ?? 0);
    const expired = now - lastAct > INACTIVITY_MS || now - started > ABSOLUTE_MS;
    expect(expired).toBe(true);
  });
});
