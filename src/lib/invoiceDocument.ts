import type { Invoice, CompanySettings } from "@/lib/types";

/** Display date as DD.MM.YYYY (matches printed invoice samples). */
export function formatInvoiceDisplayDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return iso;
}

export interface LabelValueRow {
  label: string;
  value: string;
}

export function invoiceReferenceRows(
  invoice: Invoice,
  company: CompanySettings
): LabelValueRow[] {
  const lut =
    company.lut_arn_no.trim() !== ""
      ? `${company.lut_arn_no}${company.lut_arn_date ? ` DATED - ${formatInvoiceDisplayDate(company.lut_arn_date)}` : ""}`
      : "";

  return [
    {
      label: "Invoice No & date",
      value: `${invoice.invoice_number}  DT: ${formatInvoiceDisplayDate(invoice.invoice_date)}`,
    },
    { label: "Buyer's Order No.", value: invoice.buyer_order_no || "" },
    { label: "DUTY DRAWBACK UNDER :", value: invoice.duty_drawback || "" },
    { label: "BANK AD CODE :", value: company.bank_ad_code || "" },
    { label: "HS CODE:", value: invoice.hs_code || "" },
    { label: "LUT ARN NO :", value: lut },
  ];
}

export function amountInWords(amount: number, currency: string): string {
  const ones = [
    "", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
    "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN",
    "SEVENTEEN", "EIGHTEEN", "NINETEEN",
  ];
  const tens = [
    "", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY",
  ];

  function toWords(n: number): string {
    if (n === 0) return "";
    if (n < 20) return ones[n] + " ";
    if (n < 100) {
      return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "") + " ";
    }
    if (n < 1000) return ones[Math.floor(n / 100)] + " HUNDRED " + toWords(n % 100);
    if (n < 100000) return toWords(Math.floor(n / 1000)) + "THOUSAND " + toWords(n % 1000);
    if (n < 10000000) return toWords(Math.floor(n / 100000)) + "LAKH " + toWords(n % 100000);
    return toWords(Math.floor(n / 10000000)) + "CRORE " + toWords(n % 10000000);
  }

  const currencyMap: Record<string, { major: string; minor: string }> = {
    USD: { major: "US DOLLAR", minor: "CENTS" },
    EUR: { major: "EURO", minor: "CENTS" },
    GBP: { major: "POUND STERLING", minor: "PENCE" },
    AED: { major: "UAE DIRHAM", minor: "FILS" },
    INR: { major: "INDIAN RUPEE", minor: "PAISE" },
  };
  const names = currencyMap[currency] ?? { major: currency, minor: "CENTS" };
  const major = Math.floor(amount);
  const minor = Math.round((amount - major) * 100);
  let result = toWords(major).trim() + " " + names.major;
  if (minor > 0) result += " AND " + toWords(minor).trim() + " " + names.minor;
  return result + " ONLY";
}

/** Column header for the rate column in all invoice outputs. Falls back to the currency code when no Incoterm is set. */
export function rateColumnLabel(incoterm: string, currency: string): string {
  const term = incoterm.trim();
  return term ? `${term} ${currency}` : currency;
}

export function fmtAmount(n: number, decimals = 2): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
