import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  PlusCircle,
  RefreshCw,
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
import { useInvoices } from "@/hooks/useInvoices";
import { getDb } from "@/lib/db";
import { formatInvoiceDisplayDate, fmtAmount } from "@/lib/invoiceDocument";
import {
  compareNumbers,
  compareStrings,
  isDateInRange,
  toggleSort,
  type SortDirection,
} from "@/lib/listUtils";
import { cn } from "@/lib/utils";
import { FileX } from "lucide-react";

const MODE_CHIP: Record<string, string> = {
  "BY SEA": "SEA",
  "BY AIR": "AIR",
  "BY ROAD": "ROAD",
  "BY COURIER": "COURIER",
};

type SortKey =
  | "invoice_number"
  | "invoice_date"
  | "transport_mode"
  | "consignee_name"
  | "country_of_destination"
  | "currency"
  | "amount"
  | "status";

const COLUMNS: { key: SortKey; label: string; right?: boolean; cls?: string }[] = [
  { key: "invoice_number", label: "Invoice No" },
  { key: "invoice_date", label: "Date" },
  { key: "transport_mode", label: "Mode" },
  { key: "consignee_name", label: "Consignee" },
  { key: "country_of_destination", label: "Destination" },
  { key: "currency", label: "Cur", cls: "w-[60px]" },
  { key: "amount", label: "Amount", right: true },
  { key: "status", label: "Status" },
];

export function InvoiceList() {
  const navigate = useNavigate();
  const { invoices, loading, reload } = useInvoices();
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>("invoice_date");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [totals, setTotals] = useState<Record<number, number>>({});

  useEffect(() => {
    (async () => {
      try {
        const db = await getDb();
        const rows = await db.select<{ id: number; total: number }[]>(`
          SELECT invoice_id as id, COALESCE(SUM(total_amount), 0) as total
          FROM invoice_items
          GROUP BY invoice_id
        `);
        const map: Record<number, number> = {};
        rows.forEach((r) => { map[r.id] = r.total; });
        setTotals(map);
      } catch {
        /* DB not available outside Tauri */
      }
    })();
  }, [invoices]);

  function handleSort(key: SortKey) {
    const next = toggleSort(sortKey, sortDir, key);
    setSortKey(next.key);
    setSortDir(next.dir);
  }

  const filtered = useMemo(() => {
    let data = invoices;
    if (statusFilter !== "all") data = data.filter((i) => i.status === statusFilter);
    if (dateFrom || dateTo) {
      data = data.filter((i) => isDateInRange(i.invoice_date, dateFrom, dateTo));
    }
    if (globalFilter) {
      const q = globalFilter.toLowerCase();
      data = data.filter(
        (i) =>
          i.invoice_number.toLowerCase().includes(q) ||
          i.consignee_name.toLowerCase().includes(q)
      );
    }
    if (sortKey) {
      data = [...data].sort((a, b) => {
        let cmp = 0;
        switch (sortKey) {
          case "amount":
            cmp = compareNumbers(totals[a.id] ?? 0, totals[b.id] ?? 0);
            break;
          default:
            cmp = compareStrings(String(a[sortKey] ?? ""), String(b[sortKey] ?? ""));
        }
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return data;
  }, [invoices, statusFilter, globalFilter, dateFrom, dateTo, sortKey, sortDir, totals]);

  return (
    <div className="p-[18px] space-y-3 animate-fade-up">
      <PageHeader
        title="Invoices"
        subtitle={`${invoices.length} invoice${invoices.length !== 1 ? "s" : ""} total`}
        actions={
          <>
            <Button size="sm" variant="outline" onClick={reload} disabled={loading}>
              <RefreshCw size={13} className={cn("mr-1.5", loading && "animate-spin")} />
              Refresh
            </Button>
            <Button size="sm" onClick={() => navigate("/invoices/new")}>
              <PlusCircle size={13} className="mr-1.5" />
              New Invoice
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
            placeholder="Search invoice #, consignee, buyer order…"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
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
            <SelectItem value="final">Final</SelectItem>
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
                {COLUMNS.map(({ key, label, right, cls }) => (
                  <th
                    key={key}
                    className={cn(
                      "px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-400 dark:text-zinc-600",
                      right ? "text-right" : "text-left",
                      cls
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => handleSort(key)}
                      className={cn(
                        "inline-flex items-center gap-1 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors",
                        right && "ml-auto"
                      )}
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
                  <td colSpan={8}>
                    <EmptyState
                      icon={FileX}
                      title="No invoices found"
                      description={
                        globalFilter || statusFilter !== "all" || dateFrom || dateTo
                          ? "Try adjusting your search or filters"
                          : "Create your first invoice to get started"
                      }
                      action={
                        !globalFilter && statusFilter === "all" && !dateFrom && !dateTo ? (
                          <Button size="sm" onClick={() => navigate("/invoices/new")}>
                            <PlusCircle size={13} className="mr-1.5" />
                            New Invoice
                          </Button>
                        ) : undefined
                      }
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => navigate(`/invoices/${inv.id}`)}
                    className="border-b border-zinc-100 dark:border-zinc-800/60 last:border-0 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors duration-[80ms]"
                  >
                    <td className="px-3 py-2.5 font-mono font-semibold text-indigo-400 whitespace-nowrap">
                      {inv.invoice_number}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                      {formatInvoiceDisplayDate(inv.invoice_date)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center px-[7px] py-[2px] rounded-[4px] text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                        {MODE_CHIP[inv.transport_mode] ?? inv.transport_mode}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-zinc-800 dark:text-zinc-200 max-w-[160px] truncate">
                      {inv.consignee_name || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-500 dark:text-zinc-400 max-w-[120px] truncate">
                      {inv.country_of_destination || "—"}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-zinc-500 dark:text-zinc-400 w-[60px]">
                      {inv.currency}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-zinc-800 dark:text-zinc-200 whitespace-nowrap">
                      {totals[inv.id] !== undefined ? fmtAmount(totals[inv.id]) : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "inline-flex items-center px-1.5 py-px rounded text-[9px] font-semibold uppercase tracking-wide",
                          inv.status === "final"
                            ? "bg-indigo-400/15 text-indigo-400"
                            : "bg-amber-400/15 text-amber-400"
                        )}
                      >
                        {inv.status}
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
