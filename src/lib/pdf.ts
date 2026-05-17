import { createElement } from "react";
import { pdf, type DocumentProps } from "@react-pdf/renderer";
import type { ReactElement, JSXElementConstructor } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { InvoicePdfDocument } from "@/components/InvoicePreview/PdfDocument";
import type { Invoice, CompanySettings } from "@/lib/types";

export async function exportInvoicePdf(
  invoice: Invoice,
  company: CompanySettings
): Promise<void> {
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

  if (!path) return;
  await writeFile(path, bytes);
}
