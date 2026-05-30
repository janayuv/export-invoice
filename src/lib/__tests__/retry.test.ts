import { describe, expect, it, vi } from "vitest";
import { withRetry } from "@/lib/retry";

describe("withRetry", () => {
  it("retries on database locked errors", async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls += 1;
      if (calls < 2) throw new Error("database is locked (code: 5)");
      return "ok";
    });
    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });

  it("does not retry non-retryable errors", async () => {
    const fn = vi.fn(async () => {
      throw new Error("ERR_VALIDATION: bad input");
    });
    await expect(withRetry(fn, { maxAttempts: 3 })).rejects.toThrow("ERR_VALIDATION");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
