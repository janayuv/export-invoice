import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  PlusCircle,
  RefreshCw,
  FileX,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { PageLoader } from "@/components/PageLoader";
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders";
import { formatInvoiceDisplayDate } from "@/lib/invoiceDocument";
import {
  compareStrings,
  isDateInRange,
  toggleSort,
  type SortDirection,
} from "@/lib/listUtils";
import { cn } from "@/lib/utils";

const STATUS_BADGE: Record<string, string> = {
  confirmed: "bg-emerald-400/15 text-emerald-400",
  draft: "bg-amber-400/15 text-amber-400",
  closed: "bg-zinc-500/20 text-zinc-400",
};

type SortKey =
  | "customer_po_no"
  | "po_number"
  | "po_date"
  | "customer_name"
  | "currency"
  | "status";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "customer_po_no", label: "Customer PO No" },
  { key: "po_number", label: "Internal Ref" },
  { key: "po_date", label: "Date" },
  { key: "customer_name", label: "Customer" },
  { key: "currency", label: "Currency" },
  { key: "status", label: "Status" },
];

export function PurchaseOrderList() {
  const navigate = useNavigate();
  const { orders, loading, reload } = usePurchaseOrders();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>("po_date");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  function handleSort(key: SortKey) {
    const next = toggleSort(sortKey, sortDir, key);
    setSortKey(next.key);
    setSortDir(next.dir);
  }

  const filtered = useMemo(() => {
    let data = orders;
    if (statusFilter !== "all") data = data.filter((o) => o.status === statusFilter);
    if (dateFrom || dateTo) {
      data = data.filter((o) => isDateInRange(o.po_date, dateFrom, dateTo));
    }
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(
        (o) =>
          o.po_number.toLowerCase().includes(q) ||
          (o.customer_po_no ?? "").toLowerCase().includes(q) ||
          o.customer_name.toLowerCase().includes(q)
      );
    }
    if (sortKey) {
      data = [...data].sort((a, b) => {
        const av = sortKey === "customer_po_no" ? a.customer_po_no ?? "" : String(a[sortKey] ?? "");
        const bv = sortKey === "customer_po_no" ? b.customer_po_no ?? "" : String(b[sortKey] ?? "");
        const cmp = compareStrings(av, bv);
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return data;
  }, [orders, search, statusFilter, dateFrom, dateTo, sortKey, sortDir]);

  return (
    <div className="p-[18px] space-y-3 animate-fade-up">
      <PageHeader
        title="Purchase Orders"
        subtitle={`${orders.length} order${orders.length !== 1 ? "s" : ""} total`}
        actions={
          <>
            <Button size="sm" variant="outline" onClick={reload} disabled={loading}>
              <RefreshCw size={13} className={cn("mr-1.5", loading && "animate-spin")} />
              Refresh
            </Button>
            <Button size="sm" onClick={() => navigate("/purchase-orders/new")}>
              <PlusCircle size={13} className="mr-1.5" />
              New PO
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap gap-2">
        <div className="relative max-w-[340px] flex-1 min-w-[200px]">
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
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          <span className="whitespace-nowrap">Date:</span>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-[130px] h-8 text-[12px]"
            title="From (inclusive)"
          />
          <span>–</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-[130px] h-8 text-[12px]"
            title="To (inclusive)"
          />
        </div>
      </div>

      {loading ? (
        <PageLoader />
      ) : (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                {COLUMNS.map(({ key, label }) => (
                  <th
                    key={key}
                    className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-400 dark:text-zinc-600"
                  >
                    <button
                      type="button"
                      onClick={() => handleSort(key)}
                      className="inline-flex items-center gap-1 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors"
                    >
                      {label}
                      {sortKey === key ? (
                        sortDir === "asc" ? (
                          <ArrowUp size={11} />
                        ) : (
                          <ArrowDown size={11} />
                        )
                      ) : (
                        <ArrowUpDown size={11} className="opacity-40" />
                      )}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={FileX}
                      title="No purchase orders found"
                      description={
                        search || statusFilter !== "all" || dateFrom || dateTo
                          ? "Try adjusting your search or filters"
                          : "Create your first purchase order to get started"
                      }
                      action={
                        !search && statusFilter === "all" && !dateFrom && !dateTo ? (
                          <Button size="sm" onClick={() => navigate("/purchase-orders/new")}>
                            <PlusCircle size={13} className="mr-1.5" />
                            New PO
                          </Button>
                        ) : undefined
                      }
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => navigate(`/purchase-orders/${o.id}`)}
                    className="border-b border-zinc-100 dark:border-zinc-800/60 last:border-0 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors duration-[80ms]"
                  >
                    <td className="px-3 py-2.5 font-mono font-semibold text-indigo-400 whitespace-nowrap">
                      {o.customer_po_no || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                      {o.po_number}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                      {formatInvoiceDisplayDate(o.po_date)}
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-zinc-800 dark:text-zinc-200 max-w-[180px] truncate">
                      {o.customer_name || "—"}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                      {o.currency}
                    </td>
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
