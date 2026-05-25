import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
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

/**
 * All entries with their line-item snapshots parsed, for the report view.
 * This is a snapshot-based report: it reads denormalized fields from the entries
 * table — not a live join against invoices or purchase_orders.
 */
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

// ── Write commands — all validation and RBAC now live in Rust ─────────────────

export async function createEntry(
  data: EntryFormValues,
  createdBy?: number
): Promise<number> {
  return invoke<number>("create_entry", {
    payload: {
      customer_id:        data.customer_id,
      invoice_id:         data.invoice_id,
      purchase_order_id:  data.purchase_order_id,
      customer_name:      data.customer_name,
      customer_address:   data.customer_address,
      invoice_number:     data.invoice_number,
      invoice_date:       data.invoice_date,
      po_number:          data.po_number,
      po_date:            data.po_date,
      customer_po_no:     data.customer_po_no,
      currency:           data.currency,
      exchange_rate:      data.exchange_rate,
      items:              data.items,
      local_invoice_no:   data.local_invoice_no,
      local_invoice_date: data.local_invoice_date,
      shipping_bill_no:   data.shipping_bill_no,
      shipping_bill_date: data.shipping_bill_date,
      bl_awb_no:          data.bl_awb_no,
      bl_awb_date:        data.bl_awb_date,
      status:             data.status,
    },
    createdBy: createdBy ?? null,
  });
}

export async function updateEntry(
  id: number,
  data: EntryFormValues
): Promise<void> {
  await invoke("update_entry", {
    id,
    payload: {
      customer_id:        data.customer_id,
      invoice_id:         data.invoice_id,
      purchase_order_id:  data.purchase_order_id,
      customer_name:      data.customer_name,
      customer_address:   data.customer_address,
      invoice_number:     data.invoice_number,
      invoice_date:       data.invoice_date,
      po_number:          data.po_number,
      po_date:            data.po_date,
      customer_po_no:     data.customer_po_no,
      currency:           data.currency,
      exchange_rate:      data.exchange_rate,
      items:              data.items,
      local_invoice_no:   data.local_invoice_no,
      local_invoice_date: data.local_invoice_date,
      shipping_bill_no:   data.shipping_bill_no,
      shipping_bill_date: data.shipping_bill_date,
      bl_awb_no:          data.bl_awb_no,
      bl_awb_date:        data.bl_awb_date,
      status:             data.status,
    },
  });
}

export async function deleteEntry(id: number): Promise<void> {
  await invoke("delete_entry", { id });
}
