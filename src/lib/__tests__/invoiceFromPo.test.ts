import { describe, it, expect } from "vitest";
import { mapPurchaseOrderToInvoiceFields } from "@/lib/invoiceFromPo";
import type { PurchaseOrder } from "@/hooks/usePurchaseOrders";
import type { Customer } from "@/lib/customer";

function makePO(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: 1,
    po_number: "PO/1/2025-26",
    po_date: "2025-06-01",
    customer_id: 10,
    customer_name: "ACME Corp",
    customer_address: "123 Main St\nMumbai",
    customer_po_no: "CUST-001",
    delivery_date: "",
    delivery_address: "",
    port_of_discharge: "",
    final_destination: "",
    payment_terms: "Net 30",
    currency: "USD",
    exchange_rate: 84,
    notes: "Test notes",
    status: "draft",
    row_version: 1,
    show_sa_number: true,
    created_by: null,
    created_at: "2025-06-01T00:00:00",
    items: [],
    ...overrides,
  };
}

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 10,
    name: "ACME Corp",
    address: "123 Main St\nMumbai",
    country_of_destination: "GERMANY",
    port_of_discharge: "HAMBURG",
    final_destination: "BERLIN",
    currency: "USD",
    pre_carriage_by: "ROAD",
    place_of_receipt: "DELHI",
    pre_carrier: "",
    port_of_loading: "NHAVA SHEVA",
    created_at: "2025-06-01T00:00:00",
    ...overrides,
  };
}

describe("mapPurchaseOrderToInvoiceFields — basic mappings", () => {
  it("maps customer_po_no → buyer_order_no", () => {
    const result = mapPurchaseOrderToInvoiceFields(makePO());
    expect(result.buyer_order_no).toBe("CUST-001");
  });

  it("transfers show_sa_number from PO", () => {
    expect(mapPurchaseOrderToInvoiceFields(makePO({ show_sa_number: false })).show_sa_number).toBe(false);
    expect(mapPurchaseOrderToInvoiceFields(makePO({ show_sa_number: true })).show_sa_number).toBe(true);
  });

  it("sets purchase_order_id", () => {
    expect(mapPurchaseOrderToInvoiceFields(makePO({ id: 42 })).purchase_order_id).toBe(42);
  });

  it("forces exchange_rate to 1 when currency is INR", () => {
    const result = mapPurchaseOrderToInvoiceFields(makePO({ currency: "INR", exchange_rate: 84 }));
    expect(result.exchange_rate).toBe(1);
    expect(result.currency).toBe("INR");
  });

  it("preserves exchange_rate for non-INR currencies", () => {
    const result = mapPurchaseOrderToInvoiceFields(makePO({ currency: "USD", exchange_rate: 84 }));
    expect(result.exchange_rate).toBe(84);
  });

  it("coerces unknown currency to USD", () => {
    const result = mapPurchaseOrderToInvoiceFields(makePO({ currency: "JPY" as "USD" }));
    expect(result.currency).toBe("USD");
  });
});

describe("mapPurchaseOrderToInvoiceFields — consignee logic", () => {
  it("uses customer as consignee when delivery_address is empty", () => {
    const result = mapPurchaseOrderToInvoiceFields(makePO({ delivery_address: "" }));
    expect(result.consignee_name).toBe("ACME Corp");
    expect(result.consignee_address).toBe("123 Main St\nMumbai");
    expect(result.buyer_if_other).toBe("");
  });

  it("uses customer as consignee when delivery_address matches customer_address", () => {
    const result = mapPurchaseOrderToInvoiceFields(
      makePO({ delivery_address: "123 Main St\nMumbai" })
    );
    expect(result.consignee_name).toBe("ACME Corp");
    expect(result.buyer_if_other).toBe("");
  });

  it("uses delivery_address as consignee when it differs from customer_address", () => {
    const result = mapPurchaseOrderToInvoiceFields(
      makePO({ delivery_address: "Warehouse Alpha\n456 Port Rd\nMumbai Port" })
    );
    expect(result.consignee_name).toBe("Warehouse Alpha");
    expect(result.consignee_address).toBe("456 Port Rd\nMumbai Port");
    expect(result.buyer_if_other).toContain("ACME Corp");
  });
});

describe("mapPurchaseOrderToInvoiceFields — customer shipping defaults", () => {
  it("fills shipping fields from customer when provided", () => {
    const result = mapPurchaseOrderToInvoiceFields(makePO(), makeCustomer());
    expect(result.country_of_destination).toBe("GERMANY");
    expect(result.port_of_loading).toBe("NHAVA SHEVA");
    expect(result.port_of_discharge).toBe("HAMBURG");
  });

  it("PO port_of_discharge overrides customer when non-empty", () => {
    const result = mapPurchaseOrderToInvoiceFields(
      makePO({ port_of_discharge: "ROTTERDAM" }),
      makeCustomer()
    );
    expect(result.port_of_discharge).toBe("ROTTERDAM");
  });
});
