// Orchestrates invoice PDF export: renders the PDF bytes off the UI thread in a
// Web Worker, then runs the Tauri save dialog + writeFile on the main thread.
// Falls back to rendering on the main thread if the worker is unavailable (e.g.
// test environments), so PDF export never silently breaks.
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { buildInvoicePdfBytes } from "@/lib/pdfBuild";
import type { Invoice, CompanySettings } from "@/lib/types";
import type { PdfRequest, PdfResponse } from "@/lib/pdfWorker";

// Run one render request in a fresh worker, resolving to the produced bytes.
// PDF exports are infrequent, so a per-call worker keeps response matching
// simple and frees the bundle as soon as the job finishes.
function buildInWorker(request: PdfRequest): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./pdfWorker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (e: MessageEvent<PdfResponse>) => {
      const res = e.data;
      worker.terminate();
      if (res.ok) resolve(new Uint8Array(res.bytes));
      else reject(new Error(res.error));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || "PDF worker failed"));
    };
    worker.postMessage(request);
  });
}

// Render off-thread when possible; fall back to the main thread on any worker
// failure so a flaky/unsupported Worker never blocks a PDF export.
async function buildBytes(invoice: Invoice, company: CompanySettings): Promise<Uint8Array> {
  if (typeof Worker === "undefined") return buildInvoicePdfBytes(invoice, company);
  try {
    return await buildInWorker({ kind: "invoice-pdf", invoice, company });
  } catch (e) {
    console.warn("PDF worker failed; rendering on main thread instead.", e);
    return buildInvoicePdfBytes(invoice, company);
  }
}

// Returns true when a file was written, false when the user cancelled the save
// dialog. Genuine write errors still throw so callers can surface them.
export async function exportInvoicePdf(
  invoice: Invoice,
  company: CompanySettings,
): Promise<boolean> {
  const bytes = await buildBytes(invoice, company);

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
