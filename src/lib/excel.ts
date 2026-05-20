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

  const hasLogo = Boolean(company.company_logo_base64);

  const exporterRows: (string | number | null)[][] = [
    [company.name],
    [company.address],
    ...(company.gstin ? [[`GSTIN NO: ${company.gstin}`]] : []),
    ...(company.iec ? [[`IEC: ${company.iec}`]] : []),
    ...(company.pan ? [[`PAN: ${company.pan}`]] : []),
  ];

  // refs[0] = Invoice No & date — rendered as its own prominent row
  const bodyRefs = refs.slice(1);

  // Reserve 3 blank rows at the top when a logo is present so the
  // image anchor has visual space. Content shifts down by LOGO_ROWS.
  const LOGO_ROWS = 3;
  const LOGO_ROW_HEIGHT_PT = 20; // 3 × 20 pt ≈ 60 pt total

  const rows: (string | number | null)[][] = [
    ...(hasLogo ? Array.from({ length: LOGO_ROWS }, () => [] as (string | number | null)[]) : []),
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

  if (hasLogo) {
    // Set heights for the reserved logo rows.
    ws["!rows"] = Array.from({ length: LOGO_ROWS }, () => ({ hpt: LOGO_ROW_HEIGHT_PT }));

    const m = company.company_logo_base64.match(/^data:(image\/[\w+]+);base64,(.+)$/);
    if (m) {
      const mimeType = m[1];
      const b64 = m[2];
      const ext = mimeType.split("/")[1];

      // Decode base64 → Uint8Array (atob is available in WebView / browser).
      const raw = atob(b64);
      const buf = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);

      // !images is a SheetJS Pro feature; XLSX CE 0.18.x silently ignores it at
      // write time. The structure below is correct for a Pro build or a future
      // library upgrade — CE will still produce blank reserved rows above the data.
      (ws as Record<string, unknown>)["!images"] = [
        {
          name: `logo.${ext}`,
          data: buf,
          type: mimeType,
          position: {
            type: "absoluteAnchor",
            x: 0,
            y: 0,
            // 1 pt = 12700 EMU; width ≈ 120 pt, height = reserved row area
            w: 120 * 12700,
            h: LOGO_ROWS * LOGO_ROW_HEIGHT_PT * 12700,
          },
        },
      ];
    }
  }

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
