import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, PlusCircle, RefreshCw, Trash2, CheckCircle, FileX } from "lucide-react";
import { toast } from "@/lib/toast";
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
import { ListTable, type ListColumn } from "@/components/ListTable";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { useInvoices, deleteInvoice, finalizeInvoice } from "@/hooks/useInvoices";
import { useAuth } from "@/contexts/AuthContext";
import { formatInvoiceDisplayDate, fmtAmount } from "@/lib/invoiceDocument";
import {
  compareNumbers,
  compareStrings,
  isDateInRange,
  toggleSort,
  type SortDirection,
} from "@/lib/listUtils";
import { cn } from "@/lib/utils";
import type { Invoice } from "@/lib/types";

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

const COLUMNS: ListColumn<Invoice, SortKey>[] = [
  {
    key: "invoice_number",
    header: "Invoice No",
    className: "font-mono font-semibold text-indigo-400 whitespace-nowrap",
    cell: (inv) => inv.invoice_number,
  },
  {
    key: "invoice_date",
    header: "Date",
    className: "text-zinc-500 dark:text-zinc-400 whitespace-nowrap",
    cell: (inv) => formatInvoiceDisplayDate(inv.invoice_date),
  },
  {
    key: "transport_mode",
    header: "Mode",
    cell: (inv) => (
      <span className="inline-flex items-center px-[7px] py-[2px] rounded-[4px] text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
        {MODE_CHIP[inv.transport_mode] ?? inv.transport_mode}
      </span>
    ),
  },
  {
    key: "consignee_name",
    header: "Consignee",
    className: "font-semibold text-zinc-800 dark:text-zinc-200 max-w-[160px] truncate",
    cell: (inv) => inv.consignee_name || "—",
  },
  {
    key: "country_of_destination",
    header: "Destination",
    className: "text-zinc-500 dark:text-zinc-400 max-w-[120px] truncate",
    cell: (inv) => inv.country_of_destination || "—",
  },
  {
    key: "currency",
    header: "Cur",
    headerClassName: "w-[60px]",
    className: "font-mono text-[11px] text-zinc-500 dark:text-zinc-400 w-[60px]",
    cell: (inv) => inv.currency,
  },
  {
    key: "amount",
    header: "Amount",
    align: "right",
    className: "font-mono text-zinc-800 dark:text-zinc-200 whitespace-nowrap",
    cell: (inv) => (inv.amount !== undefined ? fmtAmount(inv.amount) : "—"),
  },
  {
    key: "status",
    header: "Status",
    cell: (inv) => (
      <span
        aria-label={`Status: ${inv.status}`}
        className={cn(
          "inline-flex items-center px-1.5 py-px rounded text-[9px] font-semibold uppercase tracking-wide",
          inv.status === "final"
            ? "bg-indigo-400/15 text-indigo-400"
            : "bg-amber-400/15 text-amber-400",
        )}
      >
        {inv.status}
      </span>
    ),
  },
];

export function InvoiceList() {
  const navigate = useNavigate();
  const { invoices, loading, reload } = useInvoices();
  const { can } = useAuth();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>("invoice_date");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const canBulk = can("finalize_invoice") || can("delete_invoice");

  // Clear selection when filters change.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [statusFilter, globalFilter, dateFrom, dateTo]);

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
          i.invoice_number.toLowerCase().includes(q) || i.consignee_name.toLowerCase().includes(q),
      );
    }
    if (sortKey) {
      data = [...data].sort((a, b) => {
        let cmp: number;
        switch (sortKey) {
          case "amount":
            cmp = compareNumbers(a.amount ?? 0, b.amount ?? 0);
            break;
          default:
            cmp = compareStrings(String(a[sortKey] ?? ""), String(b[sortKey] ?? ""));
        }
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return data;
  }, [invoices, statusFilter, globalFilter, dateFrom, dateTo, sortKey, sortDir]);

  const allSelected = filtered.length > 0 && filtered.every((i) => selectedIds.has(i.id));
  const someSelected = selectedIds.size > 0;

  function toggleRow(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(filtered.map((i) => i.id)));
  }

  const handleBulkFinalize = useCallback(async () => {
    const drafts = filtered.filter((i) => selectedIds.has(i.id) && i.status === "draft");
    if (drafts.length === 0) {
      toast.info("No draft invoices selected.");
      return;
    }
    const ok = await confirm({
      title: `Finalize ${drafts.length} invoice${drafts.length > 1 ? "s" : ""}?`,
      description: "Finalized invoices cannot be edited.",
      confirmLabel: "Finalize",
      variant: "default",
    });
    if (!ok) return;
    setBulkBusy(true);
    let failed = 0;
    for (const inv of drafts) {
      try {
        await finalizeInvoice(inv.id);
      } catch {
        failed++;
      }
    }
    setBulkBusy(false);
    setSelectedIds(new Set());
    reload();
    if (failed > 0) toast.error(`${failed} invoice(s) could not be finalized.`);
    else toast.success(`${drafts.length} invoice(s) finalized.`);
  }, [filtered, selectedIds, confirm, reload]);

  const handleBulkDelete = useCallback(async () => {
    const ids = filtered.filter((i) => selectedIds.has(i.id));
    const ok = await confirm({
      title: `Delete ${ids.length} invoice${ids.length > 1 ? "s" : ""}?`,
      description: "This cannot be undone.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    setBulkBusy(true);
    let failed = 0;
    for (const inv of ids) {
      try {
        await deleteInvoice(inv.id);
      } catch {
        failed++;
      }
    }
    setBulkBusy(false);
    setSelectedIds(new Set());
    reload();
    if (failed > 0) toast.error(`${failed} invoice(s) could not be deleted.`);
    else toast.success(`${ids.length} invoice(s) deleted.`);
  }, [filtered, selectedIds, confirm, reload]);

  return (
    <div className="p-[18px] space-y-3 animate-fade-up">
      {confirmDialog}

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
            placeholder="Search invoice #, consignee…"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-8 text-[12px] h-8"
            aria-label="Search invoices"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
          <SelectTrigger className="w-[140px] h-8 text-[12px]" aria-label="Filter by status">
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
            aria-label="From date"
          />
          <span>–</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-[130px] h-8 text-[12px]"
            aria-label="To date"
          />
        </div>
      </div>

      <ListTable<Invoice, SortKey>
        data={filtered}
        columns={COLUMNS}
        getRowId={(inv) => inv.id}
        loading={loading}
        ariaLabel="Invoices"
        caption={`${filtered.length} invoice${filtered.length !== 1 ? "s" : ""} shown`}
        onRowClick={(inv) => navigate(`/invoices/${inv.id}`)}
        sort={{ sortKey, sortDir, onSort: handleSort }}
        selection={{
          enabled: canBulk,
          isSelected: (inv) => selectedIds.has(inv.id),
          allSelected,
          onToggleAll: toggleAll,
          onToggleRow: (inv) => toggleRow(inv.id),
          selectAllAriaLabel: "Select all invoices",
          rowAriaLabel: (inv) => `Select invoice ${inv.invoice_number}`,
        }}
        emptyState={
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
        }
      />

      {/* Bulk action bar — floats above content when rows are selected */}
      {someSelected && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-zinc-900 dark:bg-zinc-800 border border-zinc-700 text-zinc-100 px-4 py-2.5 rounded-xl shadow-2xl text-[12px]">
          <span className="font-medium">{selectedIds.size} selected</span>
          <div className="h-4 w-px bg-zinc-600" />
          {can("finalize_invoice") && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] border-zinc-600 text-zinc-100 hover:bg-zinc-700"
              disabled={bulkBusy}
              onClick={handleBulkFinalize}
            >
              <CheckCircle size={12} className="mr-1.5" />
              Finalize selected
            </Button>
          )}
          {can("delete_invoice") && (
            <Button
              size="sm"
              variant="destructive"
              className="h-7 text-[11px]"
              disabled={bulkBusy}
              onClick={handleBulkDelete}
            >
              <Trash2 size={12} className="mr-1.5" />
              Delete selected
            </Button>
          )}
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="ml-1 text-zinc-400 hover:text-zinc-200 text-[11px]"
            aria-label="Clear selection"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
