import * as XLSX from "xlsx";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

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

export async function exportEntriesReportExcel(rows: EntryReportRow[]): Promise<void> {
  const data: (string | number)[][] = rows.map((r) => [
    r.customer_name,
    r.invoice_number,
    r.invoice_date,
    r.po_number,
    r.po_date,
    r.part_number,
    r.description,
    r.quantity ?? "",
    r.unit_price ?? "",
    r.invoice_total,
    r.exchange_rate,
    r.local_invoice_no,
    r.local_invoice_date,
    r.shipping_bill_no,
    r.shipping_bill_date,
    r.bl_awb_no,
    r.bl_awb_date,
  ]);

  const ws = XLSX.utils.aoa_to_sheet([HEADER, ...data]);
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
  const bytes = new Uint8Array(wbArray);

  const stamp = new Date().toISOString().split("T")[0];
  const path = await save({
    defaultPath: `entry-report-${stamp}.xlsx`,
    filters: [{ name: "Excel Workbook", extensions: ["xlsx"] }],
    title: "Save Entry Report as Excel",
  });

  if (!path) return;
  await writeFile(path, bytes);
}
