import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PlusCircle, Search, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { ListTable, type ListColumn } from "@/components/ListTable";
import { useEntries, type EntrySummary } from "@/hooks/useEntries";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const COLUMNS: ListColumn<EntrySummary>[] = [
  {
    key: "customer_name",
    header: "Customer",
    className: "font-semibold text-zinc-800 dark:text-zinc-200",
    cell: (e) => e.customer_name || "—",
  },
  {
    key: "invoice_number",
    header: "Invoice No",
    className: "font-mono text-indigo-400",
    cell: (e) => e.invoice_number || "—",
  },
  {
    key: "invoice_date",
    header: "Invoice Date",
    className: "text-zinc-500",
    cell: (e) => e.invoice_date || "—",
  },
  {
    key: "po_number",
    header: "PO No",
    className: "text-zinc-500",
    cell: (e) => e.po_number || "—",
  },
  {
    key: "local_invoice_no",
    header: "Local Invoice No",
    className: "text-zinc-500",
    cell: (e) => e.local_invoice_no || "—",
  },
  {
    key: "shipping_bill_no",
    header: "Shipping Bill No",
    className: "text-zinc-500",
    cell: (e) => e.shipping_bill_no || "—",
  },
  {
    key: "status",
    header: "Status",
    cell: (e) => (
      <span
        className={cn(
          "inline-flex items-center px-1.5 py-px rounded text-[9px] font-semibold uppercase tracking-wide",
          e.status === "final"
            ? "bg-indigo-400/15 text-indigo-400"
            : "bg-amber-400/15 text-amber-400",
        )}
      >
        {e.status}
      </span>
    ),
  },
];

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
        e.shipping_bill_no.toLowerCase().includes(q),
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

      <ListTable<EntrySummary>
        data={filtered}
        columns={COLUMNS}
        getRowId={(e) => e.id}
        loading={loading}
        ariaLabel="Entries"
        onRowClick={(e) => navigate(`/entries/${e.id}/edit`)}
        emptyState={
          <EmptyState
            icon={ClipboardList}
            title="No entries found"
            description={
              filter ? "Try adjusting your search" : "Create your first entry to get started"
            }
            action={
              !filter && can("create_invoice") ? (
                <Button size="sm" onClick={() => navigate("/entries/new")}>
                  <PlusCircle size={13} className="mr-1.5" />
                  New Entry
                </Button>
              ) : undefined
            }
          />
        }
      />
    </div>
  );
}
