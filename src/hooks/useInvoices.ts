import { useState, useEffect, useCallback } from "react";
import { getDb } from "@/lib/db";
import type { Invoice, InvoiceItem, InvoiceFormValues } from "@/lib/types";

function getFiscalYear(date: Date): { fyStart: number; fyLabel: string } {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const fyStart = month >= 4 ? year : year - 1;
  const fyEnd = fyStart + 1;
  return { fyStart, fyLabel: `${fyStart}-${String(fyEnd).slice(-2)}` };
}

export async function generateInvoiceNumber(date?: Date): Promise<string> {
  const db = await getDb();
  const { fyStart, fyLabel } = getFiscalYear(date ?? new Date());

  await db.execute(
    "INSERT OR IGNORE INTO invoice_sequence (year, last_number) VALUES (?, 0)",
    [fyStart]
  );
  await db.execute(
    "UPDATE invoice_sequence SET last_number = last_number + 1 WHERE year = ?",
    [fyStart]
  );
  const rows = await db.select<{ last_number: number }[]>(
    "SELECT last_number FROM invoice_sequence WHERE year = ?",
    [fyStart]
  );
  return `EXP/${rows[0].last_number}/${fyLabel}`;
}

export function useInvoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    try {
      setLoading(true);
      const db = await getDb();
      const rows = await db.select<Invoice[]>(
        `SELECT id, invoice_number, invoice_date, transport_mode,
                consignee_name, country_of_destination, currency, status, created_at
         FROM invoices ORDER BY created_at DESC`
      );
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
  const db = await getDb();
  const rows = await db.select<Invoice[]>(
    "SELECT * FROM invoices WHERE id = ?",
    [id]
  );
  if (rows.length === 0) return null;
  const invoice = rows[0];
  const items = await db.select<InvoiceItem[]>(
    "SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sr_no",
    [id]
  );
  invoice.items = items;
  return invoice;
}

export async function createInvoice(
  data: InvoiceFormValues,
  createdBy?: number
): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO invoices (
      invoice_number, invoice_date, transport_mode, buyer_order_no,
      duty_drawback, hs_code, other_references, consignee_name,
      consignee_address, buyer_if_other, country_of_origin, country_of_destination,
      pre_carriage_by, place_of_receipt, pre_carrier, vessel,
      port_of_loading, port_of_discharge, final_destination, terms_of_payment,
      currency, exchange_rate, net_weight, gross_weight, notes, status, created_by
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
      $17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27
    )`,
    [
      data.invoice_number, data.invoice_date, data.transport_mode,
      data.buyer_order_no, data.duty_drawback, data.hs_code,
      data.other_references, data.consignee_name, data.consignee_address,
      data.buyer_if_other, data.country_of_origin, data.country_of_destination,
      data.pre_carriage_by, data.place_of_receipt, data.pre_carrier,
      data.vessel, data.port_of_loading, data.port_of_discharge,
      data.final_destination, data.terms_of_payment, data.currency,
      data.exchange_rate, data.net_weight, data.gross_weight,
      data.notes, data.status, createdBy ?? null,
    ]
  );

  const invoiceId = result.lastInsertId ?? 0;
  for (const item of data.items) {
    await db.execute(
      `INSERT INTO invoice_items (
        invoice_id, sr_no, marks_nos, no_of_pkgs, dimensions,
        part_number, description, quantity, unit, unit_price, total_amount
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        invoiceId, item.sr_no, item.marks_nos, item.no_of_pkgs,
        item.dimensions, item.part_number, item.description,
        item.quantity, item.unit, item.unit_price, item.total_amount,
      ]
    );
  }

  return invoiceId;
}

export async function updateInvoice(
  id: number,
  data: InvoiceFormValues
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE invoices SET
      invoice_number=$1, invoice_date=$2, transport_mode=$3, buyer_order_no=$4,
      duty_drawback=$5, hs_code=$6, other_references=$7, consignee_name=$8,
      consignee_address=$9, buyer_if_other=$10, country_of_origin=$11,
      country_of_destination=$12, pre_carriage_by=$13, place_of_receipt=$14,
      pre_carrier=$15, vessel=$16, port_of_loading=$17, port_of_discharge=$18,
      final_destination=$19, terms_of_payment=$20, currency=$21,
      exchange_rate=$22, net_weight=$23, gross_weight=$24, notes=$25,
      status=$26, updated_at=datetime('now')
     WHERE id=$27`,
    [
      data.invoice_number, data.invoice_date, data.transport_mode,
      data.buyer_order_no, data.duty_drawback, data.hs_code,
      data.other_references, data.consignee_name, data.consignee_address,
      data.buyer_if_other, data.country_of_origin, data.country_of_destination,
      data.pre_carriage_by, data.place_of_receipt, data.pre_carrier,
      data.vessel, data.port_of_loading, data.port_of_discharge,
      data.final_destination, data.terms_of_payment, data.currency,
      data.exchange_rate, data.net_weight, data.gross_weight,
      data.notes, data.status, id,
    ]
  );

  await db.execute("DELETE FROM invoice_items WHERE invoice_id = ?", [id]);
  for (const item of data.items) {
    await db.execute(
      `INSERT INTO invoice_items (
        invoice_id, sr_no, marks_nos, no_of_pkgs, dimensions,
        part_number, description, quantity, unit, unit_price, total_amount
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        id, item.sr_no, item.marks_nos, item.no_of_pkgs,
        item.dimensions, item.part_number, item.description,
        item.quantity, item.unit, item.unit_price, item.total_amount,
      ]
    );
  }
}

export async function deleteInvoice(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM invoices WHERE id = ?", [id]);
}

export async function finalizeInvoice(id: number, finalizedBy?: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE invoices SET status='final', finalized_by=?, updated_at=datetime('now') WHERE id = ?",
    [finalizedBy ?? null, id]
  );
}
