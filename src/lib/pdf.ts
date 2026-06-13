import { createElement } from "react";
import { pdf, type DocumentProps } from "@react-pdf/renderer";
import type { ReactElement, JSXElementConstructor } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { InvoicePdfDocument } from "@/components/InvoicePreview/PdfDocument";
import type { Invoice, CompanySettings } from "@/lib/types";

// Returns true when a file was written, false when the user cancelled the
// save dialog. Genuine write errors still throw so callers can surface them.
export async function exportInvoicePdf(
  invoice: Invoice,
  company: CompanySettings
): Promise<boolean> {
  const element = createElement(InvoicePdfDocument, { invoice, company });
  const blob = await pdf(
    element as ReactElement<DocumentProps, string | JSXElementConstructor<unknown>>
  ).toBlob();

  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  const safeName = invoice.invoice_number.replace(/\//g, "-");
  const path = await save({
    defaultPath: `${safeName}.pdf`,
    filters: [{ name: "PDF Document", extensions: ["pdf"] }],
    title: "Save Invoice as PDF",
  });

  // save() resolves to null when the user cancels the dialog — abort without
  // writing and signal "not saved" to the caller.
  if (!path) return false;
  await writeFile(path, bytes);
  return true;
}
