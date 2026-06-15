// Web Worker: renders invoice PDF bytes off the UI thread so @react-pdf's React
// reconciler + font serialization don't freeze the app while building a PDF.
//
// Imports only the pure builder (no Tauri/filesystem deps); the save dialog +
// writeFile orchestration stays on the main thread in lib/pdf.ts.
import { buildInvoicePdfBytes } from "@/lib/pdfBuild";
import type { Invoice, CompanySettings } from "@/lib/types";

export type PdfRequest = { kind: "invoice-pdf"; invoice: Invoice; company: CompanySettings };
export type PdfResponse = { ok: true; bytes: ArrayBuffer } | { ok: false; error: string };

self.onmessage = async (e: MessageEvent<PdfRequest>) => {
  try {
    const { invoice, company } = e.data;
    const bytes = await buildInvoicePdfBytes(invoice, company);

    // Transfer the underlying ArrayBuffer to avoid a copy. The Uint8Array wraps
    // a freshly allocated buffer, so transferring is safe.
    const buffer = bytes.buffer as ArrayBuffer;
    const res: PdfResponse = { ok: true, bytes: buffer };
    (self as unknown as Worker).postMessage(res, [buffer]);
  } catch (err) {
    const res: PdfResponse = { ok: false, error: String(err) };
    (self as unknown as Worker).postMessage(res);
  }
};
