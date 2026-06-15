// Orchestrates Excel/report exports: builds the workbook bytes off the UI thread
// in a Web Worker, then runs the Tauri save dialog + writeFile on the main
// thread. Falls back to building on the main thread if the worker is
// unavailable (e.g. test environments), so exports never silently break.
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { buildInvoiceExcelBytes } from "@/lib/excel";
import { buildEntriesReportBytes, type EntryReportRow } from "@/lib/reportExcel";
import type { Invoice, CompanySettings } from "@/lib/types";
import type { ExportRequest, ExportResponse } from "@/lib/exportWorker";

// Run one build request in a fresh worker, resolving to the produced bytes.
// Exports are infrequent, so a per-call worker keeps response matching simple
// and frees the bundle as soon as the job finishes.
function buildInWorker(request: ExportRequest): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./exportWorker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (e: MessageEvent<ExportResponse>) => {
      const res = e.data;
      worker.terminate();
      if (res.ok) resolve(new Uint8Array(res.bytes));
      else reject(new Error(res.error));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || "Export worker failed"));
    };
    worker.postMessage(request);
  });
}

// Build off-thread when possible; fall back to the main thread on any worker
// failure so a flaky/unsupported Worker never blocks an export.
async function buildBytes(
  request: ExportRequest,
  fallback: () => Promise<Uint8Array> | Uint8Array,
): Promise<Uint8Array> {
  if (typeof Worker === "undefined") return fallback();
  try {
    return await buildInWorker(request);
  } catch (e) {
    console.warn("Export worker failed; building on main thread instead.", e);
    return fallback();
  }
}

// Returns true when a file was written, false when the user cancelled the save
// dialog. Genuine errors still throw so callers can surface them.
export async function exportInvoiceExcel(
  invoice: Invoice,
  company: CompanySettings,
): Promise<boolean> {
  const bytes = await buildBytes({ kind: "invoice-excel", invoice, company }, () =>
    buildInvoiceExcelBytes(invoice, company),
  );

  const safeName = invoice.invoice_number.replace(/\//g, "-");
  const path = await save({
    defaultPath: `${safeName}.xlsx`,
    filters: [{ name: "Excel Workbook", extensions: ["xlsx"] }],
    title: "Save Invoice as Excel",
  });
  if (!path) return false;

  await writeFile(path, bytes);
  return true;
}

// Returns true when a file was written, false when the user cancelled.
export async function exportEntriesReportExcel(rows: EntryReportRow[]): Promise<boolean> {
  const bytes = await buildBytes({ kind: "report-excel", rows }, () =>
    buildEntriesReportBytes(rows),
  );

  const stamp = new Date().toISOString().split("T")[0];
  const path = await save({
    defaultPath: `entry-report-${stamp}.xlsx`,
    filters: [{ name: "Excel Workbook", extensions: ["xlsx"] }],
    title: "Save Entry Report as Excel",
  });
  if (!path) return false;

  await writeFile(path, bytes);
  return true;
}
