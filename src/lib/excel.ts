import * as XLSX from "xlsx";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import type { Invoice, CompanySettings } from "@/lib/types";
import {
  amountInWords,
  formatInvoiceDisplayDate,
  invoiceReferenceRows,
  rateColumnLabel,
} from "@/lib/invoiceDocument";

export async function exportInvoiceExcel(
  invoice: Invoice,
  company: CompanySettings
): Promise<void> {
  const items = invoice.items ?? [];
  const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalAmt = items.reduce((sum, i) => sum + i.total_amount, 0);
  const refs = invoiceReferenceRows(invoice, company);
  const rateLabel = rateColumnLabel(invoice.incoterm, invoice.currency);

  const exporterRows: (string | number | null)[][] = [
    [company.name],
    [company.address],
    ...(company.gstin ? [[`GSTIN NO: ${company.gstin}`]] : []),
    ...(company.iec ? [[`IEC: ${company.iec}`]] : []),
    ...(company.pan ? [[`PAN: ${company.pan}`]] : []),
  ];

  // refs[0] = Invoice No & date — rendered as its own prominent row
  const bodyRefs = refs.slice(1);

  const rows: (string | number | null)[][] = [
    [invoice.transport_mode, "", "INVOICE CUM PACKING LIST"],
    ["", "", `INVOICE NO: ${invoice.invoice_number}    DATE: ${formatInvoiceDisplayDate(invoice.invoice_date)}`],
    [],
    ["Exporter", "", bodyRefs[0]?.label ?? "", bodyRefs[0]?.value ?? ""],
    ...exporterRows.slice(1).map((r, i) => {
      const ref = bodyRefs[i + 1];
      return [r[0], "", ref?.label ?? "", ref?.value ?? ""];
    }),
    ...bodyRefs.slice(exporterRows.length).map((r) => ["", "", r.label, r.value]),
    [],
    ["Consignee", "", "Buyer (If other than consignee)"],
    [invoice.consignee_name, "", invoice.buyer_if_other],
    [invoice.consignee_address],
    [],
    [
      "Pre-Carriage by",
      invoice.pre_carriage_by,
      "Place of Receipt by",
      invoice.place_of_receipt,
      "Country of Origin of Goods",
      invoice.country_of_origin,
    ],
    [
      "",
      invoice.pre_carrier,
      "Pre carrier",
      "",
      "Country of Final Destination",
      invoice.country_of_destination,
    ],
    [
      "Vessel",
      invoice.vessel,
      "Port of Loading",
      invoice.port_of_loading,
      "Terms of payment:",
      invoice.terms_of_payment,
    ],
    ["Port of Discharge", invoice.port_of_discharge, "Final Destination", invoice.final_destination],
    [],
    ["GOODS"],
    ["Sr.", "Part Number", "Description of goods", "Quantity", "Rate", "Amount"],
    ["", "", "", "NOS", rateLabel, rateLabel],
    ...items.map((item) => [
      item.sr_no,
      item.part_number,
      item.description,
      item.quantity,
      item.unit_price,
      item.total_amount,
    ]),
    ["", "", "TOTAL", totalQty, "", totalAmt],
    [],
    ["(IN WORDS)", amountInWords(totalAmt, invoice.currency)],
    [],
    ["PACKING LIST"],
    ["Sr.", "Marks & Nos", "No of Pkgs", "Dimensions", "Unit"],
    ...items.map((item) => [
      item.sr_no,
      item.marks_nos,
      item.no_of_pkgs,
      item.dimensions,
      item.dimensions_unit,
    ]),
    ...(invoice.net_weight || invoice.gross_weight
      ? [[
          [
            invoice.net_weight ? `Nt Wt: ${invoice.net_weight}` : "",
            invoice.gross_weight ? `Gr Wt: ${invoice.gross_weight}` : "",
          ]
            .filter(Boolean)
            .join("   "),
        ]]
      : []),
    [],
    [
      "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.",
    ],
    ...(company.lut_arn_no
      ? [
          [
            `Export under LUT ARN: ${company.lut_arn_no}${company.lut_arn_date ? ` dated ${formatInvoiceDisplayDate(company.lut_arn_date)}` : ""}`,
          ],
        ]
      : []),
    [],
    [`Place : ${company.place}`],
    [`Date : ${formatInvoiceDisplayDate(invoice.invoice_date)}`],
    ["", "", "", "", "", `For ${company.name}`],
    [],
    ["", "", "", "", "", "Authorised Signatory"],
    ["", "", "", "", "", company.signatory_name ? `(${company.signatory_name})` : ""],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);

  ws["!cols"] = [
    { wch: 6 },   // Sr.
    { wch: 22 },  // Part Number / Marks & Nos
    { wch: 36 },  // Description / No of Pkgs
    { wch: 12 },  // Quantity / Dimensions
    { wch: 18 },  // Rate
    { wch: 18 },  // Amount
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Invoice");

  const wbArray = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const bytes = new Uint8Array(wbArray);

  const safeName = invoice.invoice_number.replace(/\//g, "-");
  const path = await save({
    defaultPath: `${safeName}.xlsx`,
    filters: [{ name: "Excel Workbook", extensions: ["xlsx"] }],
    title: "Save Invoice as Excel",
  });

  if (!path) return;
  await writeFile(path, bytes);
}
