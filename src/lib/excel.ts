import * as XLSX from "xlsx";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import type { Invoice, CompanySettings } from "@/lib/types";

export async function exportInvoiceExcel(
  invoice: Invoice,
  company: CompanySettings
): Promise<void> {
  const items = invoice.items ?? [];
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const totalAmt = items.reduce((s, i) => s + i.total_amount, 0);

  const rows: (string | number | null)[][] = [
    [`${invoice.transport_mode}`, "", "INVOICE CUM PACKING LIST", "", "", ""],
    [],
    ["Exporter", "", "Invoice No & date", `${invoice.invoice_number}  DT: ${invoice.invoice_date}`],
    [company.name, "", "Buyer's Order No.", invoice.buyer_order_no],
    [company.address, "", "Duty Drawback Under:", invoice.duty_drawback],
    ["", "", "Bank AD Code:", company.bank_ad_code],
    [company.gstin ? `GSTIN NO: ${company.gstin}` : "", "", "HS Code:", invoice.hs_code],
    ["", "", "LUT ARN No:", `${company.lut_arn_no}${company.lut_arn_date ? ` DATED - ${company.lut_arn_date}` : ""}`],
    ["", "", "Other Reference(s):", invoice.other_references || "NIL"],
    [],
    ["Consignee", "", "Buyer (if other than consignee)"],
    [invoice.consignee_name, "", invoice.buyer_if_other],
    [invoice.consignee_address],
    [],
    ["Country of Origin of Goods", "", invoice.country_of_origin, "", "Country of Final Destination", invoice.country_of_destination],
    [],
    ["Pre-Carriage by", invoice.pre_carriage_by, "Place of Receipt by", invoice.place_of_receipt, "Terms of Payment:", invoice.terms_of_payment],
    ["Vessel", invoice.vessel, "Port of Loading", invoice.port_of_loading],
    ["Port of Discharge", invoice.port_of_discharge, "Final Destination", invoice.final_destination],
    [],
    // Items table header
    ["Marks & Nos", "No of Pkgs", "Description of goods", "Qty (NOS)", `Rate EX WORK ${invoice.currency}`, `Amount EX WORK ${invoice.currency}`],
    // Items
    ...items.map((item) => [
      [item.marks_nos, item.dimensions ? `\nDIMENSION\n${item.dimensions}` : ""].join(""),
      item.no_of_pkgs,
      [item.description, item.part_number].filter(Boolean).join("\n"),
      item.quantity,
      item.unit_price,
      item.total_amount,
    ]),
    // Weight
    ...(invoice.net_weight || invoice.gross_weight
      ? [[`Nt Wt: ${invoice.net_weight}  Gr Wt: ${invoice.gross_weight}`]]
      : []),
    [],
    ["", "", "TOTAL", totalQty, "", totalAmt],
    ["", "", "", "", `TOTAL ${invoice.currency}`, totalAmt],
    [],
    ["(IN WORDS)", "", amountInWords(totalAmt, invoice.currency)],
    [],
    ["We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct."],
    [],
    ["", "", "", "", `Place : ${company.place}`],
    ["", "", "", "", `Date : ${invoice.invoice_date}`],
    ["", "", "", "", `For ${company.name}`],
    [],
    ["", "", "", "", "Authorised Signatory"],
    ["", "", "", "", company.signatory_name ? `(${company.signatory_name})` : ""],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);

  ws["!cols"] = [
    { wch: 20 }, // Marks & Nos
    { wch: 12 }, // No of Pkgs
    { wch: 30 }, // Description
    { wch: 10 }, // Qty
    { wch: 16 }, // Rate
    { wch: 16 }, // Amount
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

function amountInWords(amount: number, currency: string): string {
  const ones = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
    "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN",
    "EIGHTEEN", "NINETEEN"];
  const t = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];
  function w(n: number): string {
    if (n === 0) return "";
    if (n < 20) return ones[n] + " ";
    if (n < 100) return t[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "") + " ";
    if (n < 1000) return ones[Math.floor(n / 100)] + " HUNDRED " + w(n % 100);
    if (n < 100000) return w(Math.floor(n / 1000)) + "THOUSAND " + w(n % 1000);
    return w(Math.floor(n / 100000)) + "LAKH " + w(n % 100000);
  }
  const map: Record<string, { major: string; minor: string }> = {
    USD: { major: "US DOLLAR", minor: "CENTS" },
    EUR: { major: "EURO", minor: "CENTS" },
    GBP: { major: "POUND STERLING", minor: "PENCE" },
    AED: { major: "UAE DIRHAM", minor: "FILS" },
    INR: { major: "INDIAN RUPEE", minor: "PAISE" },
  };
  const names = map[currency] ?? { major: currency, minor: "CENTS" };
  const major = Math.floor(amount);
  const minor = Math.round((amount - major) * 100);
  let result = w(major).trim() + " " + names.major;
  if (minor > 0) result += " AND " + w(minor).trim() + " " + names.minor;
  return result + " ONLY";
}
