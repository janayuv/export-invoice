import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, PlusCircle, RefreshCw, FileX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders";
import { formatInvoiceDisplayDate } from "@/lib/invoiceDocument";
import { cn } from "@/lib/utils";

// Status → badge style (confirmed=green, draft=amber, closed=neutral)
const STATUS_BADGE: Record<string, string> = {
  confirmed: "bg-emerald-400/15 text-emerald-400",
  draft:     "bg-amber-400/15 text-amber-400",
  closed:    "bg-zinc-500/20 text-zinc-400",
};

export function PurchaseOrderList() {
  const navigate = useNavigate();
  const { orders, loading, reload } = usePurchaseOrders();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    let data = orders;
    if (statusFilter !== "all") data = data.filter((o) => o.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(
        (o) =>
          o.po_number.toLowerCase().includes(q) ||
          (o.customer_po_no ?? "").toLowerCase().includes(q) ||
          o.customer_name.toLowerCase().includes(q)
      );
    }
    return data;
  }, [orders, search, statusFilter]);

  return (
    <div className="p-[18px] space-y-3 animate-fade-up">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-bold text-zinc-900 dark:text-zinc-50">
            Purchase Orders
          </h1>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            {orders.length} order{orders.length !== 1 ? "s" : ""} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={reload} disabled={loading}>
            <RefreshCw size={13} className={cn("mr-1.5", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => navigate("/purchase-orders/new")}>
            <PlusCircle size={13} className="mr-1.5" />
            New PO
          </Button>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="flex gap-2">
        <div className="relative max-w-[340px] flex-1">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
          />
          <Input
            placeholder="Search customer PO, internal ref, or customer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 text-[12px] h-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
          <SelectTrigger className="w-[140px] h-8 text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div className="text-center py-16 text-[12px] text-zinc-400 dark:text-zinc-600">
          Loading…
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                {(["Customer PO No", "Internal Ref", "Date", "Customer", "Currency", "Status"] as const).map(
                  (col) => (
                    <th
                      key={col}
                      className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-400 dark:text-zinc-600"
                    >
                      {col}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <FileX size={28} strokeWidth={1.5} className="text-zinc-300 dark:text-zinc-700" />
                      <div>
                        <p className="text-[13px] font-semibold text-zinc-600 dark:text-zinc-400">
                          No purchase orders found
                        </p>
                        <p className="text-[11px] mt-0.5 text-zinc-400 dark:text-zinc-600">
                          {search || statusFilter !== "all"
                            ? "Try adjusting your search or filter"
                            : "Create your first purchase order to get started"}
                        </p>
                      </div>
                      {!search && statusFilter === "all" && (
                        <Button size="sm" onClick={() => navigate("/purchase-orders/new")}>
                          <PlusCircle size={13} className="mr-1.5" />
                          New PO
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => navigate(`/purchase-orders/${o.id}`)}
                    className="border-b border-zinc-100 dark:border-zinc-800/60 last:border-0 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors duration-[80ms]"
                  >
                    {/* Customer PO No — monospace indigo */}
                    <td className="px-3 py-2.5 font-mono font-semibold text-indigo-400 whitespace-nowrap">
                      {o.customer_po_no || "—"}
                    </td>

                    {/* Internal Ref — muted */}
                    <td className="px-3 py-2.5 text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                      {o.po_number}
                    </td>

                    {/* Date — DD.MM.YYYY muted */}
                    <td className="px-3 py-2.5 text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                      {formatInvoiceDisplayDate(o.po_date)}
                    </td>

                    {/* Customer — bold */}
                    <td className="px-3 py-2.5 font-semibold text-zinc-800 dark:text-zinc-200 max-w-[180px] truncate">
                      {o.customer_name || "—"}
                    </td>

                    {/* Currency — monospace small muted */}
                    <td className="px-3 py-2.5 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                      {o.currency}
                    </td>

                    {/* Status badge */}
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "inline-flex items-center px-1.5 py-px rounded text-[9px] font-semibold uppercase tracking-wide",
                          STATUS_BADGE[o.status] ?? "bg-zinc-500/20 text-zinc-400"
                        )}
                      >
                        {o.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
