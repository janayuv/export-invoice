import { describe, expect, it } from "vitest";
import { stripErrPrefix, userMessageFromError } from "@/lib/errors";

describe("userMessageFromError", () => {
  it("maps ERR_PERMISSION to a friendly message", () => {
    const msg = userMessageFromError("ERR_PERMISSION: requires admin role");
    expect(msg).toContain("permission");
  });

  it("maps SQLite malformed errors", () => {
    const msg = userMessageFromError("database disk image is malformed (code: 11)");
    expect(msg).toContain("corrupted");
  });

  it("strips unknown ERR_ prefixes as fallback", () => {
    expect(stripErrPrefix("ERR_CUSTOM: something broke")).toBe("something broke");
  });
});
