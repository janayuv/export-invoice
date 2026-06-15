// Web Worker: builds Excel/report workbook bytes off the UI thread so large
// invoices and reports don't freeze the app while ExcelJS/SheetJS serialize.
//
// It imports only the *pure* builders (no Tauri/filesystem deps); the save
// dialog + writeFile orchestration stays on the main thread in lib/exports.ts.
import { buildInvoiceExcelBytes } from "@/lib/excel";
import { buildEntriesReportBytes } from "@/lib/reportExcel";
import type { Invoice, CompanySettings } from "@/lib/types";
import type { EntryReportRow } from "@/lib/reportExcel";

export type ExportRequest =
  | { kind: "invoice-excel"; invoice: Invoice; company: CompanySettings }
  | { kind: "report-excel"; rows: EntryReportRow[] };

export type ExportResponse = { ok: true; bytes: ArrayBuffer } | { ok: false; error: string };

self.onmessage = async (e: MessageEvent<ExportRequest>) => {
  try {
    const req = e.data;
    const bytes =
      req.kind === "invoice-excel"
        ? await buildInvoiceExcelBytes(req.invoice, req.company)
        : buildEntriesReportBytes(req.rows);

    // Transfer the underlying ArrayBuffer to avoid a copy. The Uint8Array from
    // the builders wraps a freshly allocated buffer, so transferring is safe.
    const buffer = bytes.buffer as ArrayBuffer;
    const res: ExportResponse = { ok: true, bytes: buffer };
    (self as unknown as Worker).postMessage(res, [buffer]);
  } catch (err) {
    const res: ExportResponse = { ok: false, error: String(err) };
    (self as unknown as Worker).postMessage(res);
  }
};
