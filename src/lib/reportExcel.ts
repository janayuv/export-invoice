import * as XLSX from "xlsx";
import { formatInvoiceDisplayDate } from "@/lib/invoiceDocument";

/** One flattened report row: entry-level fields repeated per invoice line item. */
export interface EntryReportRow {
  id: string;
  customer_name: string;
  invoice_number: string;
  invoice_date: string;
  po_number: string;
  po_date: string;
  part_number: string;
  description: string;
  quantity: number | null;
  unit_price: number | null;
  invoice_total: number;
  exchange_rate: number;
  local_invoice_no: string;
  local_invoice_date: string;
  shipping_bill_no: string;
  shipping_bill_date: string;
  bl_awb_no: string;
  bl_awb_date: string;
}

const HEADER = [
  "Customer",
  "Invoice No",
  "Invoice Date",
  "PO No",
  "PO Date",
  "Part No",
  "Description",
  "Qty",
  "Rate",
  "Invoice Total",
  "Ex. Rate",
  "Local Invoice No",
  "Local Invoice Date",
  "Shipping Bill No",
  "Shipping Bill Date",
  "BL/AWB No",
  "BL/AWB Date",
];

// Pure: builds the report .xlsx and returns its bytes. No Tauri/filesystem
// dependency so it can run inside a Web Worker (see lib/exportWorker.ts). The
// save dialog + writeFile orchestration lives in lib/exports.ts.
export function buildEntriesReportBytes(rows: EntryReportRow[]): Uint8Array {
  // Date columns use formatInvoiceDisplayDate (→ DD.MM.YYYY) for parity with PDF/HTML outputs.
  // Numeric columns are exported as raw numbers so Excel can sort, sum, and filter them;
  // cell format codes (.z) below match the precision shown by fmtAmount in the UI.
  const fmt = formatInvoiceDisplayDate;
  const data: (string | number)[][] = rows.map((r) => [
    r.customer_name,
    r.invoice_number,
    fmt(r.invoice_date),
    r.po_number,
    fmt(r.po_date),
    r.part_number,
    r.description,
    r.quantity ?? "",
    r.unit_price ?? "",
    r.invoice_total,
    r.exchange_rate,
    r.local_invoice_no,
    fmt(r.local_invoice_date),
    r.shipping_bill_no,
    fmt(r.shipping_bill_date),
    r.bl_awb_no,
    fmt(r.bl_awb_date),
  ]);

  const ws = XLSX.utils.aoa_to_sheet([HEADER, ...data]);

  // Keep numeric cells as true numbers while matching UI display precision.
  // Report UI uses fmtAmount(..., 2) for qty/rate/total and fmtAmount(..., 4) for ex. rate.
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const excelRow = rowIndex + 2; // row 1 is header
    const qtyCell = ws[`H${excelRow}`];
    const rateCell = ws[`I${excelRow}`];
    const totalCell = ws[`J${excelRow}`];
    const exRateCell = ws[`K${excelRow}`];

    if (qtyCell && typeof qtyCell.v === "number") qtyCell.z = "#,##0.00";
    if (rateCell && typeof rateCell.v === "number") rateCell.z = "#,##0.00";
    if (totalCell && typeof totalCell.v === "number") totalCell.z = "#,##0.00";
    if (exRateCell && typeof exRateCell.v === "number") exRateCell.z = "#,##0.0000";
  }

  ws["!cols"] = [
    { wch: 24 }, // Customer
    { wch: 16 }, // Invoice No
    { wch: 12 }, // Invoice Date
    { wch: 14 }, // PO No
    { wch: 12 }, // PO Date
    { wch: 16 }, // Part No
    { wch: 36 }, // Description
    { wch: 10 }, // Qty
    { wch: 12 }, // Rate
    { wch: 14 }, // Invoice Total
    { wch: 10 }, // Ex. Rate
    { wch: 16 }, // Local Invoice No
    { wch: 14 }, // Local Invoice Date
    { wch: 16 }, // Shipping Bill No
    { wch: 14 }, // Shipping Bill Date
    { wch: 16 }, // BL/AWB No
    { wch: 14 }, // BL/AWB Date
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Entry Report");

  const wbArray = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Uint8Array(wbArray);
}
