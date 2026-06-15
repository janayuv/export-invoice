import { describe, it, expect } from "vitest";
import {
  hasPermission,
  canEditInvoiceByStatus,
  canEditPurchaseOrderByStatus,
} from "@/lib/auth";

// ── hasPermission ─────────────────────────────────────────────────────────────

describe("hasPermission — admin", () => {
  it("has all permissions", () => {
    expect(hasPermission("admin", "delete_invoice")).toBe(true);
    expect(hasPermission("admin", "finalize_invoice")).toBe(true);
    expect(hasPermission("admin", "manage_users")).toBe(true);
    expect(hasPermission("admin", "access_settings")).toBe(true);
    expect(hasPermission("admin", "edit_confirmed_po")).toBe(true);
  });
});

describe("hasPermission — operator", () => {
  it("can create and edit invoices", () => {
    expect(hasPermission("operator", "create_invoice")).toBe(true);
    expect(hasPermission("operator", "edit_invoice")).toBe(true);
  });

  it("cannot delete, finalize, or manage users", () => {
    expect(hasPermission("operator", "delete_invoice")).toBe(false);
    expect(hasPermission("operator", "finalize_invoice")).toBe(false);
    expect(hasPermission("operator", "manage_users")).toBe(false);
    expect(hasPermission("operator", "access_settings")).toBe(false);
    expect(hasPermission("operator", "edit_confirmed_po")).toBe(false);
    expect(hasPermission("operator", "edit_final_invoice")).toBe(false);
  });

  it("can view and export invoices", () => {
    expect(hasPermission("operator", "view_invoices")).toBe(true);
    expect(hasPermission("operator", "export_invoice")).toBe(true);
  });
});

describe("hasPermission — viewer", () => {
  it("can only view and export", () => {
    expect(hasPermission("viewer", "view_invoices")).toBe(true);
    expect(hasPermission("viewer", "export_invoice")).toBe(true);
  });

  it("cannot write anything", () => {
    expect(hasPermission("viewer", "create_invoice")).toBe(false);
    expect(hasPermission("viewer", "edit_invoice")).toBe(false);
    expect(hasPermission("viewer", "delete_invoice")).toBe(false);
    expect(hasPermission("viewer", "finalize_invoice")).toBe(false);
    expect(hasPermission("viewer", "manage_users")).toBe(false);
    expect(hasPermission("viewer", "access_settings")).toBe(false);
  });
});

describe("hasPermission — create_purchase_order", () => {
  it("admin and operator can create POs; viewer cannot", () => {
    expect(hasPermission("admin", "create_purchase_order")).toBe(true);
    expect(hasPermission("operator", "create_purchase_order")).toBe(true);
    expect(hasPermission("viewer", "create_purchase_order")).toBe(false);
  });
});

// ── canEditInvoiceByStatus ────────────────────────────────────────────────────

describe("canEditInvoiceByStatus", () => {
  it("operator can edit draft", () => {
    expect(canEditInvoiceByStatus(["edit_invoice"], "draft")).toBe(true);
  });

  it("operator cannot edit final (no edit_final_invoice)", () => {
    expect(canEditInvoiceByStatus(["edit_invoice"], "final")).toBe(false);
  });

  it("admin can edit final with edit_final_invoice permission", () => {
    expect(canEditInvoiceByStatus(["edit_invoice", "edit_final_invoice"], "final")).toBe(true);
  });

  it("empty permissions cannot edit anything", () => {
    expect(canEditInvoiceByStatus([], "draft")).toBe(false);
    expect(canEditInvoiceByStatus([], "final")).toBe(false);
  });
});

// ── canEditPurchaseOrderByStatus ──────────────────────────────────────────────

describe("canEditPurchaseOrderByStatus", () => {
  it("operator can edit draft PO", () => {
    expect(canEditPurchaseOrderByStatus(["edit_invoice"], "draft")).toBe(true);
  });

  it("operator cannot edit confirmed PO", () => {
    expect(canEditPurchaseOrderByStatus(["edit_invoice"], "confirmed")).toBe(false);
  });

  it("admin can edit confirmed PO with edit_confirmed_po", () => {
    expect(canEditPurchaseOrderByStatus(["edit_invoice", "edit_confirmed_po"], "confirmed")).toBe(true);
  });

  it("nobody can edit closed PO", () => {
    expect(canEditPurchaseOrderByStatus(["edit_invoice", "edit_confirmed_po"], "closed")).toBe(false);
    expect(canEditPurchaseOrderByStatus([], "closed")).toBe(false);
  });

  it("empty permissions cannot edit draft or confirmed", () => {
    expect(canEditPurchaseOrderByStatus([], "draft")).toBe(false);
    expect(canEditPurchaseOrderByStatus([], "confirmed")).toBe(false);
  });
});
