import { useState, useMemo, useEffect } from "react";
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
import { useInvoices } from "@/hooks/useInvoices";
import { getDb } from "@/lib/db";
import { formatInvoiceDisplayDate, fmtAmount } from "@/lib/invoiceDocument";
import { cn } from "@/lib/utils";

// Transport mode → abbreviated chip label
const MODE_CHIP: Record<string, string> = {
  "BY SEA": "SEA",
  "BY AIR": "AIR",
  "BY ROAD": "ROAD",
  "BY COURIER": "COURIER",
};

export function InvoiceList() {
  const navigate = useNavigate();
  const { invoices, loading, reload } = useInvoices();
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  // Per-invoice totals — not included in the list hook's SELECT, fetched separately
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
        // DB not available outside Tauri
      }
    })();
  }, [invoices]); // re-fetch whenever the list refreshes

  const filtered = useMemo(() => {
    let data = invoices;
    if (statusFilter !== "all") data = data.filter((i) => i.status === statusFilter);
    if (globalFilter) {
      const q = globalFilter.toLowerCase();
      data = data.filter(
        (i) =>
          i.invoice_number.toLowerCase().includes(q) ||
          i.consignee_name.toLowerCase().includes(q)
      );
    }
    return data;
  }, [invoices, statusFilter, globalFilter]);

  return (
    <div className="p-[18px] space-y-3 animate-fade-up">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-bold text-zinc-900 dark:text-zinc-50">
            Invoices
          </h1>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            {invoices.length} invoice{invoices.length !== 1 ? "s" : ""} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={reload} disabled={loading}>
            <RefreshCw size={13} className={cn("mr-1.5", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => navigate("/invoices/new")}>
            <PlusCircle size={13} className="mr-1.5" />
            New Invoice
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
                {(
                  [
                    { label: "Invoice No",   right: false },
                    { label: "Date",         right: false },
                    { label: "Mode",         right: false },
                    { label: "Consignee",    right: false },
                    { label: "Destination",  right: false },
                    { label: "Cur",          right: false, cls: "w-[60px]" },
                    { label: "Amount",       right: true  },
                    { label: "Status",       right: false },
                  ] as { label: string; right: boolean; cls?: string }[]
                ).map(({ label, right, cls }) => (
                  <th
                    key={label}
                    className={cn(
                      "px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-400 dark:text-zinc-600",
                      right ? "text-right" : "text-left",
                      cls
                    )}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <FileX
                        size={28}
                        strokeWidth={1.5}
                        className="text-zinc-300 dark:text-zinc-700"
                      />
                      <div>
                        <p className="text-[13px] font-semibold text-zinc-600 dark:text-zinc-400">
                          No invoices found
                        </p>
                        <p className="text-[11px] mt-0.5 text-zinc-400 dark:text-zinc-600">
                          {globalFilter || statusFilter !== "all"
                            ? "Try adjusting your search or filter"
                            : "Create your first invoice to get started"}
                        </p>
                      </div>
                      {!globalFilter && statusFilter === "all" && (
                        <Button size="sm" onClick={() => navigate("/invoices/new")}>
                          <PlusCircle size={13} className="mr-1.5" />
                          New Invoice
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => navigate(`/invoices/${inv.id}`)}
                    className="border-b border-zinc-100 dark:border-zinc-800/60 last:border-0 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors duration-[80ms]"
                  >
                    {/* Invoice No — monospace indigo */}
                    <td className="px-3 py-2.5 font-mono font-semibold text-indigo-400 whitespace-nowrap">
                      {inv.invoice_number}
                    </td>

                    {/* Date — DD.MM.YYYY muted */}
                    <td className="px-3 py-2.5 text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                      {formatInvoiceDisplayDate(inv.invoice_date)}
                    </td>

                    {/* Mode chip */}
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center px-[7px] py-[2px] rounded-[4px] text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                        {MODE_CHIP[inv.transport_mode] ?? inv.transport_mode}
                      </span>
                    </td>

                    {/* Consignee — bold */}
                    <td className="px-3 py-2.5 font-semibold text-zinc-800 dark:text-zinc-200 max-w-[160px] truncate">
                      {inv.consignee_name || "—"}
                    </td>

                    {/* Destination — muted */}
                    <td className="px-3 py-2.5 text-zinc-500 dark:text-zinc-400 max-w-[120px] truncate">
                      {inv.country_of_destination || "—"}
                    </td>

                    {/* Currency — monospace small muted */}
                    <td className="px-3 py-2.5 font-mono text-[11px] text-zinc-500 dark:text-zinc-400 w-[60px]">
                      {inv.currency}
                    </td>

                    {/* Amount — right-aligned monospace */}
                    <td className="px-3 py-2.5 text-right font-mono text-zinc-800 dark:text-zinc-200 whitespace-nowrap">
                      {totals[inv.id] !== undefined ? fmtAmount(totals[inv.id]) : "—"}
                    </td>

                    {/* Status badge */}
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
