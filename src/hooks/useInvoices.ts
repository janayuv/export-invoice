import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getDb } from "@/lib/db";
import { withRetry } from "@/lib/retry";
import type { Invoice, InvoiceItem, InvoiceFormValues, PackingListItem } from "@/lib/types";

function getFiscalYear(date: Date): { fyStart: number; fyLabel: string } {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const fyStart = month >= 4 ? year : year - 1;
  const fyEnd = fyStart + 1;
  return { fyStart, fyLabel: `${fyStart}-${String(fyEnd).slice(-2)}` };
}

// Read-only preview — no DB write. Used by the form to display the likely next number.
export async function generateInvoiceNumber(date?: Date): Promise<string> {
  const { fyStart, fyLabel } = getFiscalYear(date ?? new Date());
  const rows = await withRetry(async () => {
    const db = await getDb();
    return db.select<{ last_number: number }[]>(
      "SELECT last_number FROM invoice_sequence WHERE year = ?",
      [fyStart]
    );
  });
  const next = rows.length > 0 ? rows[0].last_number + 1 : 1;
  return `EXP/${next}/${fyLabel}`;
}


export function useInvoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    try {
      setLoading(true);
      const rows = await withRetry(async () => {
        const db = await getDb();
        return db.select<Invoice[]>(
          `SELECT id, invoice_number, invoice_date, transport_mode,
                  consignee_name, country_of_destination, currency, status, created_at
           FROM invoices ORDER BY created_at DESC`
        );
      });
      setInvoices(rows);
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

  return { invoices, loading, error, reload: loadList };
}

export async function getInvoice(id: number): Promise<Invoice | null> {
  const rows = await withRetry(async () => {
    const db = await getDb();
    return db.select<Invoice[]>("SELECT * FROM invoices WHERE id = ?", [id]);
  });
  if (rows.length === 0) return null;
  const invoice = rows[0];
  invoice.packing_list = JSON.parse(
    (invoice.packing_list as unknown as string) || "[]"
  ) as PackingListItem[];
  const items = await withRetry(async () => {
    const db = await getDb();
    return db.select<InvoiceItem[]>(
      "SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sr_no",
      [id]
    );
  });
  invoice.items = items;
  return invoice;
}

export async function createInvoice(data: InvoiceFormValues): Promise<number> {
  return invoke<number>("create_invoice", {
    payload: { ...data, packing_list: data.packing_list ?? [] },
  });
}

export async function updateInvoice(id: number, data: InvoiceFormValues, expectedRowVersion: number): Promise<void> {
  await invoke("update_invoice", {
    id,
    expectedRowVersion,
    payload: { ...data, packing_list: data.packing_list ?? [] },
  });
}

export async function deleteInvoice(id: number): Promise<void> {
  await invoke("delete_invoice", { id });
}

export async function finalizeInvoice(id: number): Promise<void> {
  await invoke("finalize_invoice", { id });
}

export async function duplicateInvoice(id: number): Promise<number> {
  return invoke<number>("duplicate_invoice", { id });
}
