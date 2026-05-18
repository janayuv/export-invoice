import type { PurchaseOrder } from "@/hooks/usePurchaseOrders";
import type { Customer } from "@/lib/customer";
import type { InvoiceFormSchema } from "@/lib/schemas";
import type { Currency } from "@/lib/types";

const INVOICE_CURRENCIES: Currency[] = ["USD", "EUR", "GBP", "AED", "INR"];

function toInvoiceCurrency(currency: string): Currency {
  return INVOICE_CURRENCIES.includes(currency as Currency)
    ? (currency as Currency)
    : "USD";
}

/** Map a stored purchase order (header + lines) into invoice form defaults. */
export function mapPurchaseOrderToInvoiceFields(
  po: PurchaseOrder,
  customer?: Customer | null
): Partial<InvoiceFormSchema> {
  const currency = toInvoiceCurrency(po.currency);
  const exchange_rate = currency === "INR" ? 1 : po.exchange_rate;

  const items =
    (po.items ?? []).length > 0
      ? (po.items ?? []).map((line, index) => ({
          sr_no: index + 1,
          marks_nos: "",
          no_of_pkgs: "",
          dimensions: "",
          dimensions_unit: "MM",
          part_number: line.part_number,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unit_price: line.unit_price,
          total_amount: Number((line.quantity * line.unit_price).toFixed(2)),
        }))
      : undefined;

  const fromPo: Partial<InvoiceFormSchema> = {
    purchase_order_id: po.id,
    buyer_order_no: po.customer_po_no,
    consignee_name: po.customer_name,
    consignee_address: po.customer_address,
    terms_of_payment: po.payment_terms,
    currency,
    exchange_rate,
    notes: po.notes,
    other_references: po.po_number ? `Internal PO ref: ${po.po_number}` : "",
    ...(items ? { items } : {}),
  };

  if (!customer) return fromPo;

  return {
    ...fromPo,
    country_of_destination: customer.country_of_destination,
    port_of_discharge: customer.port_of_discharge,
    final_destination: customer.final_destination,
    pre_carriage_by: customer.pre_carriage_by,
    place_of_receipt: customer.place_of_receipt,
    pre_carrier: customer.pre_carrier,
    port_of_loading: customer.port_of_loading,
  };
}
