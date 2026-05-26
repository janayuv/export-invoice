import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Tauri invoke bridge — the customer functions now delegate to Rust commands.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { createCustomer, updateCustomer, deleteCustomer } from "@/lib/customer";

const VALID_DATA = {
  name: "  ACME Corp  ",
  address: "  123 Main St  ",
  country_of_destination: "GERMANY",
  port_of_discharge: "HAMBURG",
  final_destination: "BERLIN",
  currency: "USD",
  pre_carriage_by: "ROAD",
  place_of_receipt: "DELHI",
  pre_carrier: "",
  port_of_loading: "NHAVA SHEVA",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createCustomer", () => {
  it("calls invoke with trimmed name and address (no role arg)", async () => {
    vi.mocked(invoke).mockResolvedValue(99);
    const id = await createCustomer(VALID_DATA);
    expect(id).toBe(99);
    expect(invoke).toHaveBeenCalledWith("create_customer", {
      payload: expect.objectContaining({
        name: "ACME Corp",
        address: "123 Main St",
      }),
    });
  });

  it("does NOT send actingUserRole over IPC", async () => {
    vi.mocked(invoke).mockResolvedValue(1);
    await createCustomer(VALID_DATA);
    const callArgs = vi.mocked(invoke).mock.calls[0];
    expect(callArgs[1]).not.toHaveProperty("actingUserRole");
  });

  it("propagates rejection from Rust (e.g. duplicate name)", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("A customer named \"ACME Corp\" already exists."));
    await expect(createCustomer(VALID_DATA)).rejects.toThrow(/already exists/i);
  });
});

describe("updateCustomer", () => {
  it("calls invoke with id and trimmed payload (no role arg)", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await updateCustomer(1, VALID_DATA);
    expect(invoke).toHaveBeenCalledWith("update_customer", {
      id: 1,
      payload: expect.objectContaining({ name: "ACME Corp" }),
    });
  });

  it("does NOT send actingUserRole over IPC", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await updateCustomer(1, VALID_DATA);
    const callArgs = vi.mocked(invoke).mock.calls[0];
    expect(callArgs[1]).not.toHaveProperty("actingUserRole");
  });

  it("propagates rejection from Rust (e.g. duplicate name)", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("A customer named \"ACME Corp\" already exists."));
    await expect(updateCustomer(1, VALID_DATA)).rejects.toThrow(/already exists/i);
  });
});

describe("deleteCustomer", () => {
  it("calls invoke with id only (no role arg)", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await deleteCustomer(1);
    expect(invoke).toHaveBeenCalledWith("delete_customer", {
      id: 1,
    });
  });

  it("does NOT send actingUserRole over IPC", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await deleteCustomer(1);
    const callArgs = vi.mocked(invoke).mock.calls[0];
    expect(callArgs[1]).not.toHaveProperty("actingUserRole");
  });

  it("propagates rejection from Rust (e.g. referential safety)", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("Cannot delete: customer has 3 purchase order(s)"));
    await expect(deleteCustomer(1)).rejects.toThrow(/3 purchase order/i);
  });
});
