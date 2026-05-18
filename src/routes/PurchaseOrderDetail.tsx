import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Edit, CheckCircle, XCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  draft: "secondary",
  confirmed: "default",
  closed: "outline",
};

export function PurchaseOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { can, currentUser } = useAuth();
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
      setPo((p) => p ? { ...p, status: "confirmed" } : p);
      toast.success("Purchase order confirmed");
    } catch (e) { toast.error(`Error: ${e}`); }
  }

  async function handleClose() {
    if (!po) return;
    if (!confirm("Mark this PO as closed?")) return;
    try {
      await closePO(po.id);
      setPo((p) => p ? { ...p, status: "closed" } : p);
      toast.success("Purchase order closed");
    } catch (e) { toast.error(`Error: ${e}`); }
  }

  async function handleDelete() {
    if (!po) return;
    if (!confirm(`Delete PO ${po.po_number}?`)) return;
    try {
      await deletePurchaseOrder(po.id);
      toast.success("Purchase order deleted");
      navigate("/purchase-orders");
    } catch (e) { toast.error(`Error: ${e}`); }
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!po) return <div className="p-6 text-destructive">Purchase order not found.</div>;

  const items = po.items ?? [];
  const totalAmount = items.reduce((s, i) => s + i.total_amount, 0);
  const isDraft = po.status === "draft";
  const isConfirmed = po.status === "confirmed";
  const canEdit =
    currentUser != null && canEditPurchaseOrderByStatus(currentUser.role, po.status);

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      {/* Action bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/purchase-orders")}>
            <ArrowLeft size={16} />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg">{po.customer_po_no || po.po_number}</span>
              <Badge variant={STATUS_VARIANT[po.status] ?? "secondary"}>
                {po.status.charAt(0).toUpperCase() + po.status.slice(1)}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              PO date: {po.po_date}
              {po.po_number ? ` · Internal ref: ${po.po_number}` : ""}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/purchase-orders/${po.id}/edit`)}>
              <Edit size={14} className="mr-1" /> Edit
            </Button>
          )}
          {isDraft && can("finalize_invoice") && (
            <Button size="sm" onClick={handleConfirm}>
              <CheckCircle size={14} className="mr-1" /> Confirm PO
            </Button>
          )}
          {isConfirmed && can("finalize_invoice") && (
            <Button variant="outline" size="sm" onClick={handleClose}>
              <XCircle size={14} className="mr-1" /> Close PO
            </Button>
          )}
          {can("delete_invoice") && (
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              <Trash2 size={14} className="mr-1" /> Delete
            </Button>
          )}
        </div>
      </div>

      {/* PO Preview */}
      <div className="border rounded-lg bg-card text-sm font-mono">
        {/* Title */}
        <div className="border-b px-6 py-3 text-center">
          <div className="text-xs text-muted-foreground">{settings?.name}</div>
          <div className="font-bold text-base mt-0.5">PURCHASE ORDER</div>
        </div>

        {/* Header grid */}
        <div className="grid grid-cols-2 border-b">
          {/* Customer */}
          <div className="border-r p-4 space-y-1">
            <div className="text-[10px] text-muted-foreground uppercase font-sans font-semibold tracking-wide">Customer</div>
            <div className="font-bold">{po.customer_name || "—"}</div>
            {po.customer_address && (
              <div className="text-xs text-muted-foreground whitespace-pre-line">{po.customer_address}</div>
            )}
          </div>
          {/* PO details */}
          <div className="p-4 space-y-1.5">
            <Row label="Customer PO No" value={po.customer_po_no || "—"} />
            <Row label="Internal Ref" value={po.po_number} />
            <Row label="PO Date" value={po.po_date} />
            {po.delivery_date && <Row label="Expiry Date" value={po.delivery_date} />}
            {po.payment_terms && <Row label="Payment Terms" value={po.payment_terms} />}
            <Row label="Currency" value={`${po.currency}${po.exchange_rate !== 1 ? ` @ ${po.exchange_rate}` : ""}`} />
          </div>
        </div>

        {/* Deliver to */}
        {po.delivery_address && (
          <div className="border-b px-4 py-3">
            <span className="text-[10px] font-sans font-semibold text-muted-foreground uppercase tracking-wide">Deliver To: </span>
            <span className="whitespace-pre-line">{po.delivery_address}</span>
          </div>
        )}

        {/* Items table */}
        <table className="w-full border-b">
          <thead>
            <tr className="border-b bg-muted/30 text-[10px] font-sans font-semibold text-muted-foreground uppercase tracking-wide">
              <th className="p-2 text-left w-8">Sr.</th>
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
              <tr key={item.sr_no} className="border-b last:border-0">
                <td className="p-2 text-center text-muted-foreground">{item.sr_no}</td>
                <td className="p-2">{item.part_number}</td>
                <td className="p-2">{item.description}</td>
                <td className="p-2 text-right">
                  {item.quantity.toLocaleString("en-IN")}
                </td>
                <td className="p-2">{item.unit}</td>
                <td className="p-2 text-right">
                  {item.unit_price.toFixed(2)}
                </td>
                <td className="p-2 text-right font-medium">
                  {item.total_amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/20 font-bold">
              <td colSpan={5} className="p-2 text-right text-xs font-sans font-semibold text-muted-foreground uppercase tracking-wide">
                Total {po.currency}
              </td>
              <td />
              <td className="p-2 text-right">
                {totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Notes + signatory */}
        <div className="grid grid-cols-2 p-4 gap-6">
          <div>
            {po.notes && (
              <>
                <div className="text-[10px] font-sans font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  Notes
                </div>
                <div className="text-xs whitespace-pre-line">{po.notes}</div>
              </>
            )}
          </div>
          <div className="text-right space-y-8">
            <div />
            <div>
              <div className="text-xs text-muted-foreground">For {settings?.name}</div>
              <div className="mt-6 border-t border-dashed pt-1 text-xs">
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
      <span className="text-muted-foreground w-28 shrink-0 font-sans">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
