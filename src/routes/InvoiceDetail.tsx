import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Edit, CheckCircle, Trash2, FileDown, FileSpreadsheet, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InvoicePreview } from "@/components/InvoicePreview";
import { getInvoice, deleteInvoice, finalizeInvoice } from "@/hooks/useInvoices";
import { useSettings } from "@/hooks/useSettings";
import { exportInvoicePdf } from "@/lib/pdf";
import { exportInvoiceExcel } from "@/lib/excel";
import { useAuth } from "@/contexts/AuthContext";
import type { Invoice } from "@/lib/types";

export function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { currentUser, can } = useAuth();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getInvoice(Number(id)).then((inv) => {
      setInvoice(inv);
      setLoading(false);
    });
  }, [id]);

  async function handleFinalize() {
    if (!invoice) return;
    try {
      await finalizeInvoice(invoice.id, currentUser?.id);
      setInvoice((prev) => prev ? { ...prev, status: "final" } : prev);
      toast.success("Invoice finalized");
    } catch (e) {
      toast.error(`Error: ${e}`);
    }
  }

  async function handleDelete() {
    if (!invoice) return;
    if (!confirm(`Delete invoice ${invoice.invoice_number}?`)) return;
    try {
      await deleteInvoice(invoice.id);
      toast.success("Invoice deleted");
      navigate("/invoices");
    } catch (e) {
      toast.error(`Error: ${e}`);
    }
  }

  async function handlePdf() {
    if (!invoice || !settings) return;
    try {
      await exportInvoicePdf(invoice, settings);
      toast.success("PDF exported");
    } catch (e) {
      toast.error(`PDF export failed: ${e}`);
    }
  }

  async function handleExcel() {
    if (!invoice || !settings) return;
    try {
      await exportInvoiceExcel(invoice, settings);
      toast.success("Excel exported");
    } catch (e) {
      toast.error(`Excel export failed: ${e}`);
    }
  }

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading invoice...</div>;
  }

  if (!invoice) {
    return <div className="p-6 text-destructive">Invoice not found.</div>;
  }

  const isFinal = invoice.status === "final";

  return (
    <div className="p-4 space-y-4">
      {/* Action bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/invoices")}>
            <ArrowLeft size={16} />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg">{invoice.invoice_number}</span>
              <Badge variant={isFinal ? "default" : "secondary"}>
                {isFinal ? "Final" : "Draft"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{invoice.invoice_date}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {!isFinal && can("edit_invoice") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/invoices/${invoice.id}/edit`)}
            >
              <Edit size={14} className="mr-1" />
              Edit
            </Button>
          )}
          {!isFinal && can("finalize_invoice") && (
            <Button size="sm" onClick={handleFinalize}>
              <CheckCircle size={14} className="mr-1" />
              Finalize
            </Button>
          )}
          {can("export_invoice") && (
            <>
              <Button variant="outline" size="sm" onClick={handlePdf}>
                <FileDown size={14} className="mr-1" />
                Export PDF
              </Button>
              <Button variant="outline" size="sm" onClick={handleExcel}>
                <FileSpreadsheet size={14} className="mr-1" />
                Export Excel
              </Button>
            </>
          )}
          {can("delete_invoice") && (
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              <Trash2 size={14} className="mr-1" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Invoice Preview */}
      {settings && (
        <div className="max-w-4xl mx-auto">
          <InvoicePreview invoice={invoice} company={settings} />
        </div>
      )}
    </div>
  );
}
