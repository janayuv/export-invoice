import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "@/lib/toast";
import { Edit, CheckCircle, Trash2, FileDown, FileSpreadsheet, ArrowLeft, Copy, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InvoicePreview } from "@/components/InvoicePreview";
import { PageLoader } from "@/components/PageLoader";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { getInvoice, deleteInvoice, finalizeInvoice, duplicateInvoice } from "@/hooks/useInvoices";
import { useSettings } from "@/hooks/useSettings";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { exportInvoicePdf } from "@/lib/pdf";
import { exportInvoiceExcel } from "@/lib/exports";
import { formatInvoiceDisplayDate } from "@/lib/invoiceDocument";
import { useAuth } from "@/contexts/AuthContext";
import { canEditInvoiceByStatus } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type { Invoice } from "@/lib/types";

export function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { settings, companyLogo } = useSettings();
  const { currentUser, can } = useAuth();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (!id) return;
    getInvoice(Number(id)).then((inv) => {
      setInvoice(inv);
      setLoading(false);
    });
  }, [id]);

  const invoiceWithLogo = useMemo(
    () => (invoice ? { ...invoice, company_logo_base64: companyLogo } : null),
    [invoice, companyLogo]
  );

  const isFinal = invoice?.status === "final";
  const canEdit =
    invoice != null &&
    currentUser != null &&
    canEditInvoiceByStatus(currentUser.permissions ?? [], invoice.status);

  const handleFinalize = useCallback(async () => {
    if (!invoice) return;
    try {
      await finalizeInvoice(invoice.id);
      setInvoice((prev) => (prev ? { ...prev, status: "final" } : prev));
      toast.success("Invoice finalized");
    } catch (e) {
      toast.error(`Error: ${e}`);
    }
  }, [invoice]);

  const handleDelete = useCallback(async () => {
    if (!invoice) return;
    const ok = await confirm({
      title: "Delete invoice?",
      description: `Delete invoice ${invoice.invoice_number}? This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteInvoice(invoice.id);
      toast.success("Invoice deleted");
      navigate("/invoices");
    } catch (e) {
      toast.error(`Error: ${e}`);
    }
  }, [invoice, confirm, navigate]);

  const handlePdf = useCallback(async () => {
    if (!invoiceWithLogo || !settings || isExporting) return;
    setIsExporting(true);
    const t = toast.loading("Generating PDF…");
    try {
      // Yield once so the loading toast can paint before the PDF render briefly
      // occupies the main thread (@react-pdf runs on the UI thread).
      await new Promise((r) => setTimeout(r, 0));
      // Only confirm success when a file was actually written; a false return
      // means the user cancelled the save dialog.
      const saved = await exportInvoicePdf(invoiceWithLogo, settings);
      if (saved) toast.success("PDF exported", { id: t });
      else toast.info("PDF export cancelled", { id: t });
    } catch (e) {
      toast.error(`PDF export failed: ${e}`, { id: t });
    } finally {
      setIsExporting(false);
    }
  }, [invoiceWithLogo, settings, isExporting]);

  const handleExcel = useCallback(async () => {
    if (!invoiceWithLogo || !settings || isExporting) return;
    setIsExporting(true);
    const t = toast.loading("Generating Excel…");
    try {
      // Excel is built off-thread in a Web Worker, so the loading toast stays
      // responsive while ExcelJS serializes.
      const saved = await exportInvoiceExcel(invoiceWithLogo, settings);
      if (saved) toast.success("Excel exported", { id: t });
      else toast.info("Excel export cancelled", { id: t });
    } catch (e) {
      toast.error(`Excel export failed: ${e}`, { id: t });
    } finally {
      setIsExporting(false);
    }
  }, [invoiceWithLogo, settings, isExporting]);

  const handleDuplicate = useCallback(async () => {
    if (!invoice) return;
    const ok = await confirm({
      title: "Duplicate invoice?",
      description: `Create a draft copy of ${invoice.invoice_number} with a new invoice number?`,
      confirmLabel: "Duplicate",
      variant: "default",
    });
    if (!ok) return;
    try {
      const newId = await duplicateInvoice(invoice.id);
      toast.success("Invoice duplicated");
      navigate(`/invoices/${newId}`);
    } catch (e) {
      toast.error(`Duplicate failed: ${e}`);
    }
  }, [invoice, confirm, navigate]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const shortcuts = useMemo(
    () => [
      {
        key: "s",
        ctrl: true,
        handler: () => {
          if (canEdit && invoice) navigate(`/invoices/${invoice.id}/edit`);
        },
      },
      {
        key: "Escape",
        handler: () => navigate("/invoices"),
        ignoreInputs: false,
      },
      {
        key: "p",
        ctrl: true,
        handler: () => {
          if (can("export_invoice")) void handlePdf();
        },
      },
      {
        key: "e",
        ctrl: true,
        handler: () => {
          if (can("export_invoice")) void handleExcel();
        },
      },
      {
        key: "d",
        ctrl: true,
        handler: () => {
          if (can("create_invoice")) void handleDuplicate();
        },
      },
    ],
    [canEdit, invoice, navigate, can, handlePdf, handleExcel, handleDuplicate]
  );

  useKeyboardShortcuts(shortcuts, !loading && invoice != null);

  if (loading) {
    return <PageLoader message="Loading invoice…" className="p-[18px]" />;
  }

  if (!invoice || !invoiceWithLogo) {
    return (
      <div className="p-[18px] text-[12px] text-red-500 animate-fade-up">
        Invoice not found.
      </div>
    );
  }

  return (
    <div className="p-[18px] space-y-3 animate-fade-up">
      {confirmDialog}

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => navigate("/invoices")}
            aria-label="Back to invoices"
          >
            <ArrowLeft size={15} />
          </Button>
          <div className="min-w-0">
            <h1 className="text-[20px] font-bold font-mono text-zinc-900 dark:text-zinc-50 leading-tight truncate">
              {invoice.invoice_number}
            </h1>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
              {invoice.consignee_name}
              {invoice.consignee_name ? " · " : ""}
              {formatInvoiceDisplayDate(invoice.invoice_date)}
              {" · "}
              {invoice.currency}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <span
            className={cn(
              "inline-flex items-center px-1.5 py-px rounded text-[9px] font-semibold uppercase tracking-wide",
              isFinal
                ? "bg-indigo-400/15 text-indigo-400"
                : "bg-amber-400/15 text-amber-400"
            )}
          >
            {invoice.status}
          </span>

          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/invoices/${invoice.id}/edit`)}
            >
              <Edit size={13} className="mr-1.5" />
              Edit
            </Button>
          )}

          {!isFinal && can("finalize_invoice") && (
            <Button size="sm" onClick={handleFinalize}>
              <CheckCircle size={13} className="mr-1.5" />
              Finalize
            </Button>
          )}

          {can("create_invoice") && (
            <Button variant="outline" size="sm" onClick={handleDuplicate} title="Duplicate invoice (Ctrl+D)">
              <Copy size={13} className="mr-1.5" />
              Duplicate
            </Button>
          )}

          {can("export_invoice") && (
            <>
              <Button variant="outline" size="sm" onClick={handlePdf} disabled={isExporting}>
                <FileDown size={13} className="mr-1.5" />
                PDF
              </Button>
              <Button variant="outline" size="sm" onClick={handleExcel} disabled={isExporting}>
                <FileSpreadsheet size={13} className="mr-1.5" />
                Excel
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint} title="Print (Ctrl+P)">
                <Printer size={13} className="mr-1.5" />
                Print
              </Button>
            </>
          )}

          {can("delete_invoice") && (
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              <Trash2 size={13} className="mr-1.5" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {settings && (
        <div
          className="rounded-[4px] overflow-x-auto p-6"
          style={{ background: "#c0c0c0" }}
        >
          <InvoicePreview invoice={invoiceWithLogo} company={settings} />
        </div>
      )}
    </div>
  );
}
