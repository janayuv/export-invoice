// Pure invoice PDF byte builder — no Tauri/filesystem deps so it can run inside
// a Web Worker (see lib/pdfWorker.ts) as well as on the main thread fallback.
import { createElement } from "react";
import { pdf, type DocumentProps } from "@react-pdf/renderer";
import type { ReactElement, JSXElementConstructor } from "react";
import { InvoicePdfDocument } from "@/components/InvoicePreview/PdfDocument";
import type { Invoice, CompanySettings } from "@/lib/types";

export async function buildInvoicePdfBytes(
  invoice: Invoice,
  company: CompanySettings,
): Promise<Uint8Array> {
  const element = createElement(InvoicePdfDocument, { invoice, company });
  const blob = await pdf(
    element as ReactElement<DocumentProps, string | JSXElementConstructor<unknown>>,
  ).toBlob();
  const arrayBuffer = await blob.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}
