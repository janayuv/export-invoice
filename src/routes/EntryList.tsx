import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PlusCircle, Search, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { PageLoader } from "@/components/PageLoader";
import { useEntries } from "@/hooks/useEntries";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

export function EntryList() {
  const navigate = useNavigate();
  const { entries, loading } = useEntries();
  const { can } = useAuth();
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.customer_name.toLowerCase().includes(q) ||
        e.invoice_number.toLowerCase().includes(q) ||
        e.po_number.toLowerCase().includes(q) ||
        e.local_invoice_no.toLowerCase().includes(q) ||
        e.shipping_bill_no.toLowerCase().includes(q)
    );
  }, [entries, filter]);

  return (
    <div className="p-[18px] space-y-3 animate-fade-up">
      <PageHeader
        title="Entries"
        subtitle={`${entries.length} total entr${entries.length !== 1 ? "ies" : "y"}`}
        actions={
          can("create_invoice") ? (
            <Button size="sm" onClick={() => navigate("/entries/new")}>
              <PlusCircle size={13} className="mr-1.5" />
              New Entry
            </Button>
          ) : undefined
        }
      />

      <div className="relative max-w-[340px]">
        <Search
          size={13}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
        />
        <Input
          placeholder="Search customer, invoice, PO, shipping bill…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="pl-8 text-[12px] h-8"
        />
      </div>

      {loading ? (
        <PageLoader />
      ) : (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                {(
                  ["Customer", "Invoice No", "Invoice Date", "PO No", "Local Invoice No", "Shipping Bill No", "Status"] as const
                ).map((col) => (
                  <th
                    key={col}
                    className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-400 dark:text-zinc-600"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon={ClipboardList}
                      title="No entries found"
                      description={filter ? "Try adjusting your search" : "Create your first entry to get started"}
                      action={
                        !filter && can("create_invoice") ? (
                          <Button size="sm" onClick={() => navigate("/entries/new")}>
                            <PlusCircle size={13} className="mr-1.5" />
                            New Entry
                          </Button>
                        ) : undefined
                      }
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((entry) => (
                  <tr
                    key={entry.id}
                    onClick={() => navigate(`/entries/${entry.id}/edit`)}
                    className="border-b border-zinc-100 dark:border-zinc-800/60 last:border-0 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors duration-[80ms]"
                  >
                    <td className="px-3 py-2.5 font-semibold text-zinc-800 dark:text-zinc-200">
                      {entry.customer_name || "—"}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-indigo-400">{entry.invoice_number || "—"}</td>
                    <td className="px-3 py-2.5 text-zinc-500">{entry.invoice_date || "—"}</td>
                    <td className="px-3 py-2.5 text-zinc-500">{entry.po_number || "—"}</td>
                    <td className="px-3 py-2.5 text-zinc-500">{entry.local_invoice_no || "—"}</td>
                    <td className="px-3 py-2.5 text-zinc-500">{entry.shipping_bill_no || "—"}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "inline-flex items-center px-1.5 py-px rounded text-[9px] font-semibold uppercase tracking-wide",
                          entry.status === "final"
                            ? "bg-indigo-400/15 text-indigo-400"
                            : "bg-amber-400/15 text-amber-400"
                        )}
                      >
                        {entry.status}
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
