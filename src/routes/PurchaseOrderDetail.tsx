import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Edit, CheckCircle, XCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/PageLoader";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import {
  getPurchaseOrder,
  deletePurchaseOrder,
  confirmPO,
  closePO,
  type PurchaseOrder,
} from "@/hooks/usePurchaseOrders";
import { useSettings } from "@/hooks/useSettings";
import { useAuth } from "@/contexts/AuthContext";
import { canEditPurchaseOrderByStatus } from "@/lib/auth";
import { cn } from "@/lib/utils";

const STATUS_BADGE: Record<string, string> = {
  confirmed: "bg-emerald-400/15 text-emerald-400",
  draft: "bg-amber-400/15 text-amber-400",
  closed: "bg-zinc-500/20 text-zinc-400",
};

export function PurchaseOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { can, currentUser } = useAuth();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getPurchaseOrder(Number(id)).then((data) => {
      setPo(data);
      setLoading(false);
    });
  }, [id]);

  async function handleConfirm() {
    if (!po) return;
    try {
      await confirmPO(po.id);
      setPo((p) => (p ? { ...p, status: "confirmed" } : p));
      toast.success("Purchase order confirmed");
    } catch (e) {
      toast.error(`Error: ${e}`);
    }
  }

  const handleClose = useCallback(async () => {
    if (!po) return;
    const ok = await confirm({
      title: "Close purchase order?",
      description: "Mark this PO as closed? It will no longer be editable.",
      confirmLabel: "Close PO",
    });
    if (!ok) return;
    try {
      await closePO(po.id);
      setPo((p) => (p ? { ...p, status: "closed" } : p));
      toast.success("Purchase order closed");
    } catch (e) {
      toast.error(`Error: ${e}`);
    }
  }, [po, confirm]);

  const handleDelete = useCallback(async () => {
    if (!po) return;
    const ok = await confirm({
      title: "Delete purchase order?",
      description: `Delete PO ${po.po_number}? This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deletePurchaseOrder(po.id);
      toast.success("Purchase order deleted");
      navigate("/purchase-orders");
    } catch (e) {
      toast.error(`Error: ${e}`);
    }
  }, [po, confirm, navigate]);

  if (loading) {
    return <PageLoader message="Loading purchase order…" className="p-[18px]" />;
  }
  if (!po) {
    return (
      <div className="p-[18px] text-[12px] text-red-500 animate-fade-up">
        Purchase order not found.
      </div>
    );
  }

  const items = po.items ?? [];
  const totalAmount = items.reduce((s, i) => s + i.total_amount, 0);
  const isDraft = po.status === "draft";
  const isConfirmed = po.status === "confirmed";
  const showSa = po.show_sa_number ?? true;
  const canEdit =
    currentUser != null &&
    canEditPurchaseOrderByStatus(currentUser.permissions ?? [], po.status);

  return (
    <div className="p-[18px] space-y-3 animate-fade-up max-w-4xl">
      {confirmDialog}

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => navigate("/purchase-orders")}
            aria-label="Back to purchase orders"
          >
            <ArrowLeft size={15} />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[20px] font-bold text-zinc-900 dark:text-zinc-50 truncate">
                {po.customer_po_no || po.po_number}
              </h1>
              <span
                className={cn(
                  "inline-flex items-center px-1.5 py-px rounded text-[9px] font-semibold uppercase tracking-wide",
                  STATUS_BADGE[po.status] ?? "bg-zinc-500/20 text-zinc-400"
                )}
              >
                {po.status}
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              PO date: {po.po_date}
              {po.po_number ? ` · Internal ref: ${po.po_number}` : ""}
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap justify-end">
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/purchase-orders/${po.id}/edit`)}>
              <Edit size={13} className="mr-1.5" /> Edit
            </Button>
          )}
          {isDraft && can("finalize_invoice") && (
            <Button size="sm" onClick={handleConfirm}>
              <CheckCircle size={13} className="mr-1.5" /> Confirm PO
            </Button>
          )}
          {isConfirmed && can("finalize_invoice") && (
            <Button variant="outline" size="sm" onClick={handleClose}>
              <XCircle size={13} className="mr-1.5" /> Close PO
            </Button>
          )}
          {can("delete_invoice") && (
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              <Trash2 size={13} className="mr-1.5" /> Delete
            </Button>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden text-sm font-mono">
        <div className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-3 text-center">
          <div className="text-[10px] text-zinc-500 font-sans">{settings?.name}</div>
          <div className="font-bold text-base mt-0.5">PURCHASE ORDER</div>
        </div>

        <div className="grid grid-cols-2 border-b border-zinc-200 dark:border-zinc-800">
          <div className="border-r border-zinc-200 dark:border-zinc-800 p-4 space-y-1">
            <div className="text-[10px] text-zinc-500 uppercase font-sans font-semibold tracking-wide">Customer</div>
            <div className="font-bold">{po.customer_name || "—"}</div>
            {po.customer_address && (
              <div className="text-xs text-zinc-500 whitespace-pre-line">{po.customer_address}</div>
            )}
          </div>
          <div className="p-4 space-y-1.5">
            <Row label="Customer PO No" value={po.customer_po_no || "—"} />
            <Row label="Internal Ref" value={po.po_number} />
            <Row label="PO Date" value={po.po_date} />
            {po.delivery_date && <Row label="Expiry Date" value={po.delivery_date} />}
            {po.payment_terms && <Row label="Payment Terms" value={po.payment_terms} />}
            <Row
              label="Currency"
              value={`${po.currency}${po.exchange_rate !== 1 ? ` @ ${po.exchange_rate}` : ""}`}
            />
          </div>
        </div>

        {po.delivery_address && (
          <div className="border-b border-zinc-200 dark:border-zinc-800 px-4 py-3">
            <span className="text-[10px] font-sans font-semibold text-zinc-500 uppercase tracking-wide">
              Deliver To:{" "}
            </span>
            <span className="whitespace-pre-line">{po.delivery_address}</span>
          </div>
        )}

        <table className="w-full border-b border-zinc-200 dark:border-zinc-800">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 text-[10px] font-sans font-semibold text-zinc-500 uppercase tracking-wide">
              <th className="p-2 text-left w-8">Sr.</th>
              {showSa && <th className="p-2 text-left w-24">SA Number</th>}
              <th className="p-2 text-left">Part Number</th>
              <th className="p-2 text-left">Description</th>
              <th className="p-2 text-right w-20">Qty</th>
              <th className="p-2 text-left w-16">Unit</th>
              <th className="p-2 text-right w-24">Unit Price</th>
              <th className="p-2 text-right w-24">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.sr_no} className="border-b border-zinc-100 dark:border-zinc-800/60 last:border-0">
                <td className="p-2 text-center text-zinc-500">{item.sr_no}</td>
                {showSa && <td className="p-2">{item.sa_number}</td>}
                <td className="p-2">{item.part_number}</td>
                <td className="p-2">{item.description}</td>
                <td className="p-2 text-right">{item.quantity.toLocaleString("en-IN")}</td>
                <td className="p-2">{item.unit}</td>
                <td className="p-2 text-right">{item.unit_price.toFixed(2)}</td>
                <td className="p-2 text-right font-medium">
                  {item.total_amount.toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/30 font-bold">
              <td
                colSpan={showSa ? 6 : 5}
                className="p-2 text-right text-xs font-sans font-semibold text-zinc-500 uppercase tracking-wide"
              >
                Total {po.currency}
              </td>
              <td />
              <td className="p-2 text-right">
                {totalAmount.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </td>
            </tr>
          </tfoot>
        </table>

        <div className="grid grid-cols-2 p-4 gap-6">
          <div>
            {po.notes && (
              <>
                <div className="text-[10px] font-sans font-semibold text-zinc-500 uppercase tracking-wide mb-1">
                  Notes
                </div>
                <div className="text-xs whitespace-pre-line">{po.notes}</div>
              </>
            )}
          </div>
          <div className="text-right space-y-8">
            <div />
            <div>
              <div className="text-xs text-zinc-500">For {settings?.name}</div>
              <div className="mt-6 border-t border-dashed border-zinc-300 dark:border-zinc-700 pt-1 text-xs">
                Authorised Signatory
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-zinc-500 w-28 shrink-0 font-sans">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
