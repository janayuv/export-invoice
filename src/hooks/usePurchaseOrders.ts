import { useState, useEffect, useCallback } from "react";
import { getDb } from "@/lib/db";

export interface POItem {
  id?: number;
  po_id?: number;
  sr_no: number;
  part_number: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_amount: number;
}

export interface PurchaseOrder {
  id: number;
  po_number: string;
  po_date: string;
  customer_id: number | null;
  customer_name: string;
  customer_address: string;
  delivery_date: string;
  delivery_address: string;
  payment_terms: string;
  currency: string;
  exchange_rate: number;
  notes: string;
  status: "draft" | "confirmed" | "closed";
  created_by: number | null;
  created_at: string;
  items?: POItem[];
}

export type POFormValues = Omit<
  PurchaseOrder,
  "id" | "created_at" | "items"
> & { items: POItem[] };

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
        `SELECT id, po_number, po_date, customer_name, currency, status, created_at
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

export async function createPurchaseOrder(
  data: POFormValues,
  createdBy?: number
): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO purchase_orders (
      po_number, po_date, customer_id, customer_name, customer_address,
      delivery_date, delivery_address, payment_terms,
      currency, exchange_rate, notes, status, created_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      data.po_number, data.po_date, data.customer_id, data.customer_name,
      data.customer_address, data.delivery_date,
      data.delivery_address, data.payment_terms, data.currency,
      data.exchange_rate, data.notes, data.status, createdBy ?? null,
    ]
  );
  const poId = result.lastInsertId ?? 0;
  for (const item of data.items) {
    await db.execute(
      `INSERT INTO purchase_order_items (
        po_id, sr_no, part_number, description, quantity, unit, unit_price, total_amount
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [poId, item.sr_no, item.part_number, item.description,
       item.quantity, item.unit, item.unit_price, item.total_amount]
    );
  }
  return poId;
}

export async function updatePurchaseOrder(
  id: number,
  data: POFormValues
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE purchase_orders SET
      po_number=$1, po_date=$2, customer_id=$3, customer_name=$4,
      customer_address=$5, delivery_date=$6,
      delivery_address=$7, payment_terms=$8, currency=$9,
      exchange_rate=$10, notes=$11, status=$12, updated_at=datetime('now')
    WHERE id=$13`,
    [
      data.po_number, data.po_date, data.customer_id, data.customer_name,
      data.customer_address, data.delivery_date,
      data.delivery_address, data.payment_terms, data.currency,
      data.exchange_rate, data.notes, data.status, id,
    ]
  );
  await db.execute("DELETE FROM purchase_order_items WHERE po_id = ?", [id]);
  for (const item of data.items) {
    await db.execute(
      `INSERT INTO purchase_order_items (
        po_id, sr_no, part_number, description, quantity, unit, unit_price, total_amount
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, item.sr_no, item.part_number, item.description,
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
