import { useState, useEffect, useCallback } from "react";
import { getDb } from "@/lib/db";

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
  show_sa_number: boolean;
  created_by: number | null;
  created_at: string;
  items?: POItem[];
}

export type POFormValues = Omit<
  PurchaseOrder,
  "id" | "created_at" | "items"
> & { items: POItem[] };

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

export async function generatePONumber(date?: Date): Promise<string> {
  const db = await getDb();
  const { fyStart, fyLabel } = getFiscalYear(date ?? new Date());
  await db.execute(
    "INSERT OR IGNORE INTO po_sequence (year, last_number) VALUES (?, 0)",
    [fyStart]
  );
  await db.execute(
    "UPDATE po_sequence SET last_number = last_number + 1 WHERE year = ?",
    [fyStart]
  );
  const rows = await db.select<{ last_number: number }[]>(
    "SELECT last_number FROM po_sequence WHERE year = ?",
    [fyStart]
  );
  return `PO/${rows[0].last_number}/${fyLabel}`;
}

export function usePurchaseOrders() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    try {
      setLoading(true);
      const db = await getDb();
      const rows = await db.select<PurchaseOrder[]>(
        `SELECT id, po_number, po_date, customer_name, customer_po_no, currency, status, created_at
         FROM purchase_orders ORDER BY created_at DESC`
      );
      setOrders(rows);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  return { orders, loading, error, reload: loadList };
}

export async function getPurchaseOrder(id: number): Promise<PurchaseOrder | null> {
  const db = await getDb();
  const rows = await db.select<PurchaseOrder[]>(
    "SELECT * FROM purchase_orders WHERE id = ?",
    [id]
  );
  if (rows.length === 0) return null;
  const po = rows[0];
  po.items = await db.select<POItem[]>(
    "SELECT * FROM purchase_order_items WHERE po_id = ? ORDER BY sr_no",
    [id]
  );
  return po;
}

/** Purchase orders linked to a customer master record (for invoice create/edit). */
export async function getPurchaseOrdersByCustomerId(
  customerId: number
): Promise<PurchaseOrderSummary[]> {
  const db = await getDb();
  return db.select<PurchaseOrderSummary[]>(
    `SELECT id, po_number, customer_po_no, po_date, status, currency
     FROM purchase_orders
     WHERE customer_id = ?
     ORDER BY created_at DESC`,
    [customerId]
  );
}

export async function createPurchaseOrder(
  data: POFormValues,
  createdBy?: number
): Promise<number> {
  const payload = normalizePOFormValues(data);
  const db = await getDb();
  const result = await db.execute(
    // port_of_discharge + final_destination added in migration 19.
    `INSERT INTO purchase_orders (
      po_number, po_date, customer_id, customer_name, customer_address,
      customer_po_no, delivery_date, delivery_address,
      port_of_discharge, final_destination,
      payment_terms, currency, exchange_rate, notes, status, created_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      payload.po_number, payload.po_date, payload.customer_id, payload.customer_name,
      payload.customer_address, payload.customer_po_no, payload.delivery_date,
      payload.delivery_address, payload.port_of_discharge, payload.final_destination,
      payload.payment_terms, payload.currency,
      payload.exchange_rate, payload.notes, payload.status, createdBy ?? null,
    ]
  );
  const poId = result.lastInsertId ?? 0;
  for (const item of payload.items) {
    await db.execute(
      `INSERT INTO purchase_order_items (
        po_id, sr_no, part_number, sa_number, description, quantity, unit, unit_price, total_amount
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [poId, item.sr_no, item.part_number, item.sa_number, item.description,
       item.quantity, item.unit, item.unit_price, item.total_amount]
    );
  }
  return poId;
}

export async function updatePurchaseOrder(
  id: number,
  data: POFormValues
): Promise<void> {
  const payload = normalizePOFormValues(data);
  const db = await getDb();
  await db.execute(
    // port_of_discharge + final_destination added in migration 19.
    `UPDATE purchase_orders SET
      po_number=$1, po_date=$2, customer_id=$3, customer_name=$4,
      customer_address=$5, customer_po_no=$6, delivery_date=$7,
      delivery_address=$8, port_of_discharge=$9, final_destination=$10,
      payment_terms=$11, currency=$12,
      exchange_rate=$13, notes=$14, status=$15, updated_at=datetime('now')
    WHERE id=$16`,
    [
      payload.po_number, payload.po_date, payload.customer_id, payload.customer_name,
      payload.customer_address, payload.customer_po_no, payload.delivery_date,
      payload.delivery_address, payload.port_of_discharge, payload.final_destination,
      payload.payment_terms, payload.currency,
      payload.exchange_rate, payload.notes, payload.status, id,
    ]
  );
  await db.execute("DELETE FROM purchase_order_items WHERE po_id = ?", [id]);
  for (const item of payload.items) {
    await db.execute(
      `INSERT INTO purchase_order_items (
        po_id, sr_no, part_number, sa_number, description, quantity, unit, unit_price, total_amount
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, item.sr_no, item.part_number, item.sa_number, item.description,
       item.quantity, item.unit, item.unit_price, item.total_amount]
    );
  }
}

export async function deletePurchaseOrder(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM purchase_orders WHERE id = ?", [id]);
}

export async function confirmPO(id: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE purchase_orders SET status='confirmed', updated_at=datetime('now') WHERE id = ?",
    [id]
  );
}

export async function closePO(id: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE purchase_orders SET status='closed', updated_at=datetime('now') WHERE id = ?",
    [id]
  );
}
