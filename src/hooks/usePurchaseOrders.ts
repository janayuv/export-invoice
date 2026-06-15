import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getDb } from "@/lib/db";
import { withRetry } from "@/lib/retry";
import { useAsyncList } from "@/hooks/useAsyncList";

export interface POItem {
  id?: number;
  po_id?: number;
  sr_no: number;
  part_number: string;
  sa_number: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_amount: number;
}

/** List row for invoice PO picker (customer-scoped). */
export interface PurchaseOrderSummary {
  id: number;
  po_number: string;
  customer_po_no: string;
  po_date: string;
  status: PurchaseOrder["status"];
  currency: string;
}

export interface PurchaseOrder {
  id: number;
  po_number: string;
  po_date: string;
  customer_id: number | null;
  customer_name: string;
  customer_address: string;
  customer_po_no: string;
  delivery_date: string;
  delivery_address: string;
  // PO-level delivery override for invoices; falls back to buyer if empty.
  port_of_discharge: string;
  final_destination: string;
  payment_terms: string;
  currency: string;
  exchange_rate: number;
  notes: string;
  status: "draft" | "confirmed" | "closed";
  row_version: number;
  show_sa_number: boolean;
  created_by: number | null;
  created_at: string;
  items?: POItem[];
}

export type POFormValues = Omit<PurchaseOrder, "id" | "row_version" | "created_at" | "items"> & {
  items: POItem[];
};

/** Trim text fields and recompute line totals without altering qty/unit/price values. */
export function normalizePOFormValues(data: POFormValues): POFormValues {
  return {
    ...data,
    customer_po_no: data.customer_po_no.trim(),
    payment_terms: data.payment_terms.trim(),
    notes: data.notes.trim(),
    customer_name: data.customer_name.trim(),
    customer_address: data.customer_address.trim(),
    delivery_address: data.delivery_address.trim(),
    items: data.items.map((item, index) => {
      const quantity = Number(item.quantity);
      const unit_price = Number(item.unit_price);
      return {
        ...item,
        sr_no: index + 1,
        part_number: item.part_number.trim(),
        sa_number: item.sa_number.trim(),
        description: item.description.trim(),
        unit: item.unit.trim(),
        quantity,
        unit_price,
        total_amount: quantity * unit_price,
      };
    }),
  };
}

function getFiscalYear(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const fyStart = month >= 4 ? year : year - 1;
  const fyEnd = fyStart + 1;
  return { fyStart, fyLabel: `${fyStart}-${String(fyEnd).slice(-2)}` };
}

// Read-only preview — no DB write. Used by the form to display the likely next number.
export async function previewPONumber(date?: Date): Promise<string> {
  const { fyStart, fyLabel } = getFiscalYear(date ?? new Date());
  const rows = await withRetry(async () => {
    const db = await getDb();
    return db.select<{ last_number: number }[]>(
      "SELECT last_number FROM po_sequence WHERE year = ?",
      [fyStart],
    );
  });
  const next = rows.length > 0 ? rows[0].last_number + 1 : 1;
  return `PO/${next}/${fyLabel}`;
}

export function usePurchaseOrders() {
  const loader = useCallback(
    () =>
      withRetry(async () => {
        const db = await getDb();
        return db.select<PurchaseOrder[]>(
          `SELECT id, po_number, po_date, customer_name, customer_po_no, currency, status, created_at
           FROM purchase_orders ORDER BY created_at DESC`,
        );
      }),
    [],
  );
  const { data, loading, error, reload } = useAsyncList<PurchaseOrder>(loader);
  return { orders: data, loading, error, reload };
}

export async function getPurchaseOrder(id: number): Promise<PurchaseOrder | null> {
  const rows = await withRetry(async () => {
    const db = await getDb();
    return db.select<PurchaseOrder[]>("SELECT * FROM purchase_orders WHERE id = ?", [id]);
  });
  if (rows.length === 0) return null;
  const po = rows[0];
  po.items = await withRetry(async () => {
    const db = await getDb();
    return db.select<POItem[]>(
      "SELECT * FROM purchase_order_items WHERE po_id = ? ORDER BY sr_no",
      [id],
    );
  });
  return po;
}

/** Purchase orders linked to a customer master record (for invoice create/edit). */
export async function getPurchaseOrdersByCustomerId(
  customerId: number,
): Promise<PurchaseOrderSummary[]> {
  return withRetry(async () => {
    const db = await getDb();
    return db.select<PurchaseOrderSummary[]>(
      `SELECT id, po_number, customer_po_no, po_date, status, currency
       FROM purchase_orders
       WHERE customer_id = ?
       ORDER BY created_at DESC`,
      [customerId],
    );
  });
}

export async function createPurchaseOrder(data: POFormValues): Promise<number> {
  const payload = normalizePOFormValues(data);
  return invoke<number>("create_purchase_order", { payload });
}

export async function updatePurchaseOrder(
  id: number,
  data: POFormValues,
  expectedRowVersion: number,
): Promise<void> {
  const payload = normalizePOFormValues(data);
  await invoke("update_purchase_order", { id, expectedRowVersion, payload });
}

export async function deletePurchaseOrder(id: number): Promise<void> {
  await invoke("delete_purchase_order", { id });
}

export async function duplicatePurchaseOrder(id: number): Promise<number> {
  return invoke<number>("duplicate_purchase_order", { id });
}

export async function confirmPO(id: number): Promise<void> {
  await invoke("set_po_status", { id, newStatus: "confirmed" });
}

export async function closePO(id: number): Promise<void> {
  await invoke("set_po_status", { id, newStatus: "closed" });
}
