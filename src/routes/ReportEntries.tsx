import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { Search, FileSpreadsheet, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/PageHeader";
import { PageLoader } from "@/components/PageLoader";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getEntriesReport, deleteEntry } from "@/hooks/useEntries";
import { fmtAmount } from "@/lib/invoiceDocument";
import { exportEntriesReportExcel, type EntryReportRow } from "@/lib/reportExcel";
import type { Entry } from "@/lib/types";

/** Flatten an entry into one report row per line item (entry fields repeated). */
function toReportRows(entry: Entry): EntryReportRow[] {
  const base = {
    customer_name: entry.customer_name,
    invoice_number: entry.invoice_number,
    invoice_date: entry.invoice_date,
    po_number: entry.po_number,
    po_date: entry.po_date,
    invoice_total: entry.invoice_total,
    exchange_rate: entry.exchange_rate,
    local_invoice_no: entry.local_invoice_no,
    local_invoice_date: entry.local_invoice_date,
    shipping_bill_no: entry.shipping_bill_no,
    shipping_bill_date: entry.shipping_bill_date,
    bl_awb_no: entry.bl_awb_no,
    bl_awb_date: entry.bl_awb_date,
  };
  const items = entry.items ?? [];
  if (items.length === 0) {
    return [
      {
        id: `${entry.id}-0`,
        ...base,
        part_number: "",
        description: "",
        quantity: null,
        unit_price: null,
      },
    ];
  }
  return items.map((it, i) => ({
    id: `${entry.id}-${i}`,
    ...base,
    part_number: it.part_number,
    description: it.description,
    quantity: it.quantity,
    unit_price: it.unit_price,
  }));
}

const num = (v: number | null) => (v == null ? "—" : fmtAmount(v));
const txt = (v: string) => v || "—";

export function ReportEntries() {
  const navigate = useNavigate();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);

  useEffect(() => {
    getEntriesReport()
      .then(setEntries)
      .catch((e) => toast.error(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => entries.flatMap(toReportRows), [entries]);

  const filtered = useMemo(() => {
    const q = globalFilter.trim().toLowerCase();
    return rows.filter((r) => {
      // Text search across key fields.
      if (q) {
        const hit = [
          r.customer_name, r.invoice_number, r.invoice_date,
          r.po_number, r.part_number, r.description,
          r.local_invoice_no, r.shipping_bill_no, r.bl_awb_no,
        ].some((v) => v.toLowerCase().includes(q));
        if (!hit) return false;
      }
      // Date range on invoice_date — inclusive boundaries, ISO string comparison
      // is safe because YYYY-MM-DD lexicographic order matches calendar order.
      if (dateFrom && r.invoice_date < dateFrom) return false;
      if (dateTo && r.invoice_date > dateTo) return false;
      return true;
    });
  }, [rows, globalFilter, dateFrom, dateTo]);

  const columns: ColumnDef<EntryReportRow>[] = [
    { accessorKey: "customer_name", header: "Customer", cell: ({ getValue }) => txt(getValue<string>()) },
    { accessorKey: "invoice_number", header: "Invoice No", cell: ({ getValue }) => txt(getValue<string>()) },
    { accessorKey: "invoice_date", header: "Invoice Date", cell: ({ getValue }) => txt(getValue<string>()) },
    { accessorKey: "po_number", header: "PO No", cell: ({ getValue }) => txt(getValue<string>()) },
    { accessorKey: "po_date", header: "PO Date", cell: ({ getValue }) => txt(getValue<string>()) },
    { accessorKey: "part_number", header: "Part No", cell: ({ getValue }) => txt(getValue<string>()) },
    { accessorKey: "description", header: "Description", cell: ({ getValue }) => txt(getValue<string>()) },
    { accessorKey: "quantity", header: "Qty", cell: ({ getValue }) => num(getValue<number | null>()) },
    { accessorKey: "unit_price", header: "Rate", cell: ({ getValue }) => num(getValue<number | null>()) },
    { accessorKey: "invoice_total", header: "Invoice Total", cell: ({ getValue }) => fmtAmount(getValue<number>() || 0) },
    { accessorKey: "exchange_rate", header: "Ex. Rate", cell: ({ getValue }) => fmtAmount(getValue<number>() || 0, 4) },
    { accessorKey: "local_invoice_no", header: "Local Inv No", cell: ({ getValue }) => txt(getValue<string>()) },
    { accessorKey: "local_invoice_date", header: "Local Inv Date", cell: ({ getValue }) => txt(getValue<string>()) },
    { accessorKey: "shipping_bill_no", header: "Shipping Bill No", cell: ({ getValue }) => txt(getValue<string>()) },
    { accessorKey: "shipping_bill_date", header: "Shipping Bill Date", cell: ({ getValue }) => txt(getValue<string>()) },
    { accessorKey: "bl_awb_no", header: "BL/AWB No", cell: ({ getValue }) => txt(getValue<string>()) },
    { accessorKey: "bl_awb_date", header: "BL/AWB Date", cell: ({ getValue }) => txt(getValue<string>()) },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => {
        const entryId = row.original.id.split("-")[0];
        return (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              aria-label="Edit entry"
              onClick={() => navigate(`/entries/${entryId}/edit`)}
            >
              <Pencil size={14} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
              aria-label="Delete entry"
              onClick={() => void handleDelete(Number(entryId))}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        );
      },
    },
  ];

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  async function handleDelete(entryId: number) {
    const ok = await confirm({
      title: "Delete entry?",
      description: "Delete this entry? This cannot be undone.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteEntry(entryId);
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
      toast.success("Entry deleted");
    } catch (e) {
      toast.error(`Delete failed: ${e}`);
    }
  }

  async function handleExport() {
    if (filtered.length === 0) {
      toast.error("No rows to export");
      return;
    }
    try {
      await exportEntriesReportExcel(filtered);
      toast.success("Report exported");
    } catch (e) {
      toast.error(`Export failed: ${e}`);
    }
  }

  return (
    <div className="p-[18px] space-y-3 animate-fade-up">
      {confirmDialog}

      <PageHeader
        title="Entry Report"
        subtitle={`${filtered.length} rows`}
        actions={
          <Button variant="outline" size="sm" onClick={handleExport}>
            <FileSpreadsheet size={13} className="mr-1.5" />
            Export Excel
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-[340px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          <Input
            placeholder="Search customer, invoice, PO, shipping bill…"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-8 text-[12px] h-8"
          />
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          <span className="whitespace-nowrap">Invoice date:</span>
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
          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="text-[11px] text-zinc-400 hover:text-zinc-600 underline"
            >
              clear
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <PageLoader />
      ) : (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className="cursor-pointer select-none whitespace-nowrap"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{ asc: " ↑", desc: " ↓" }[header.column.getIsSorted() as string] ?? ""}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-center py-12 text-muted-foreground">
                    No entries found
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="whitespace-nowrap">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
