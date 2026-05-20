import { useState, useEffect, useCallback } from "react";
import { getDb } from "@/lib/db";
import type { Entry, EntryFormValues, EntryItem } from "@/lib/types";

/** List row for the Entry table. */
export interface EntrySummary {
  id: number;
  customer_name: string;
  invoice_number: string;
  invoice_date: string;
  po_number: string;
  local_invoice_no: string;
  shipping_bill_no: string;
  status: string;
  created_at: string;
}

/** Invoice picker row, scoped to a customer via the invoice's linked PO. */
export interface InvoiceForCustomer {
  id: number;
  invoice_number: string;
  invoice_date: string;
  currency: string;
  purchase_order_id: number | null;
}

export function useEntries() {
  const [entries, setEntries] = useState<EntrySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    try {
      setLoading(true);
      const db = await getDb();
      const rows = await db.select<EntrySummary[]>(
        `SELECT id, customer_name, invoice_number, invoice_date, po_number,
                local_invoice_no, shipping_bill_no, status, created_at
         FROM entries ORDER BY created_at DESC`
      );
      setEntries(rows);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  return { entries, loading, error, reload: loadList };
}

export async function getEntry(id: number): Promise<Entry | null> {
  const db = await getDb();
  const rows = await db.select<Entry[]>("SELECT * FROM entries WHERE id = ?", [id]);
  if (rows.length === 0) return null;
  const entry = rows[0];
  entry.items = JSON.parse(
    (entry.items as unknown as string) || "[]"
  ) as EntryItem[];
  return entry;
}

/** All entries with their line-item snapshots parsed, for the report view. */
export async function getEntriesReport(): Promise<Entry[]> {
  const db = await getDb();
  const rows = await db.select<Entry[]>(
    "SELECT * FROM entries ORDER BY created_at DESC"
  );
  return rows.map((e) => ({
    ...e,
    items: JSON.parse((e.items as unknown as string) || "[]") as EntryItem[],
  }));
}

/**
 * Invoices available to link to an entry for a given customer.
 * Returns invoices tied to the customer via a PO, plus any invoice that has no
 * PO link (those are not customer-scoped and would otherwise be invisible).
 * Excludes invoices already referenced by another entry. When editing an
 * existing entry pass its id as `currentEntryId` so that entry's own invoice
 * is never hidden from the picker.
 */
export async function getInvoicesByCustomerId(
  customerId: number,
  currentEntryId: number | null = null
): Promise<InvoiceForCustomer[]> {
  const db = await getDb();
  return db.select<InvoiceForCustomer[]>(
    `SELECT i.id, i.invoice_number, i.invoice_date, i.currency, i.purchase_order_id
     FROM invoices i
     LEFT JOIN purchase_orders po ON i.purchase_order_id = po.id
     WHERE (po.customer_id = ? OR i.purchase_order_id IS NULL)
       AND i.id NOT IN (
         SELECT invoice_id FROM entries
         WHERE invoice_id IS NOT NULL
           AND id != COALESCE(?, 0)
       )
     ORDER BY i.created_at DESC`,
    [customerId, currentEntryId]
  );
}

export async function createEntry(
  data: EntryFormValues,
  createdBy?: number
): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO entries (
      customer_id, invoice_id, purchase_order_id, customer_name, customer_address,
      invoice_number, invoice_date, po_number, po_date, customer_po_no,
      currency, exchange_rate, invoice_total, items,
      local_invoice_no, local_invoice_date,
      shipping_bill_no, shipping_bill_date, bl_awb_no, bl_awb_date,
      status, created_by
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
    )`,
    [
      data.customer_id, data.invoice_id, data.purchase_order_id,
      data.customer_name, data.customer_address, data.invoice_number,
      data.invoice_date, data.po_number, data.po_date, data.customer_po_no,
      data.currency, data.exchange_rate, data.invoice_total,
      JSON.stringify(data.items ?? []), data.local_invoice_no,
      data.local_invoice_date, data.shipping_bill_no, data.shipping_bill_date,
      data.bl_awb_no, data.bl_awb_date, data.status, createdBy ?? null,
    ]
  );
  return result.lastInsertId ?? 0;
}

export async function updateEntry(
  id: number,
  data: EntryFormValues
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE entries SET
      customer_id=$1, invoice_id=$2, purchase_order_id=$3, customer_name=$4,
      customer_address=$5, invoice_number=$6, invoice_date=$7, po_number=$8,
      po_date=$9, customer_po_no=$10, currency=$11, exchange_rate=$12,
      invoice_total=$13, items=$14, local_invoice_no=$15, local_invoice_date=$16,
      shipping_bill_no=$17, shipping_bill_date=$18, bl_awb_no=$19, bl_awb_date=$20,
      status=$21, updated_at=datetime('now')
     WHERE id=$22`,
    [
      data.customer_id, data.invoice_id, data.purchase_order_id,
      data.customer_name, data.customer_address, data.invoice_number,
      data.invoice_date, data.po_number, data.po_date, data.customer_po_no,
      data.currency, data.exchange_rate, data.invoice_total,
      JSON.stringify(data.items ?? []), data.local_invoice_no,
      data.local_invoice_date, data.shipping_bill_no, data.shipping_bill_date,
      data.bl_awb_no, data.bl_awb_date, data.status, id,
    ]
  );
}

export async function deleteEntry(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM entries WHERE id = ?", [id]);
}
