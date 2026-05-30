import { describe, it, expect } from "vitest";
import { invoiceFormSchema } from "@/lib/schemas";
import { LIMITS } from "@/lib/limits";

describe("schema max lengths", () => {
  it("rejects oversize notes before IPC", () => {
    const big = "x".repeat(LIMITS.NOTES + 1);
    const result = invoiceFormSchema.safeParse({
      invoice_number: "EXP/1/2025-26",
      invoice_date: "2025-01-01",
      transport_mode: "BY SEA",
      buyer_order_no: "",
      duty_drawback: "",
      hs_code: "",
      other_references: "",
      consignee_name: "Buyer",
      consignee_address: "Addr",
      buyer_if_other: "",
      country_of_origin: "INDIA",
      country_of_destination: "",
      pre_carriage_by: "",
      place_of_receipt: "",
      pre_carrier: "",
      vessel: "",
      port_of_loading: "",
      port_of_discharge: "",
      final_destination: "",
      terms_of_payment: "",
      incoterm: "",
      currency: "USD",
      exchange_rate: 1,
      net_weight: "",
      gross_weight: "",
      notes: big,
      status: "draft",
      show_sa_number: true,
      items: [
        {
          sr_no: 1,
          marks_nos: "",
          no_of_pkgs: "",
          dimensions: "",
          dimensions_unit: "",
          part_number: "",
          sa_number: "",
          description: "Item",
          quantity: 1,
          unit: "NOS",
          unit_price: 1,
          total_amount: 1,
        },
      ],
      packing_list: [],
    });
    expect(result.success).toBe(false);
  });
});
