import type { ReactNode } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { PageLoader } from "@/components/PageLoader";
import { cn } from "@/lib/utils";
import type { SortDirection } from "@/lib/listUtils";

/**
 * One column of a {@link ListTable}. `key` doubles as the sort key when the
 * column is sortable. Cell content and any per-cell `<td>` styling stay with
 * the column so the table renders entity-specific output without knowing the
 * row shape. Padding (`px-3 py-2.5`) is applied by the table; `className`
 * carries only the extras (fonts, colors, truncation, `whitespace-nowrap`).
 */
export interface ListColumn<T, K extends string = string> {
  key: K;
  header: ReactNode;
  /** Cell renderer. Defaults to `String(row[key])`. */
  cell?: (row: T, index: number) => ReactNode;
  align?: "left" | "right";
  /** Sortable when a `sort` prop is present; default true. Set false for static headers. */
  sortable?: boolean;
  /** Extra classes on the `<td>`. */
  className?: string;
  /** Extra classes on the `<th>`. */
  headerClassName?: string;
}

/** Controlled sort state. The consumer owns the state and sorts `data` itself. */
export interface ListSort<K extends string = string> {
  sortKey: K | null;
  sortDir: SortDirection;
  onSort: (key: K) => void;
}

/**
 * Optional bulk-selection extension. The consumer owns the selected set and all
 * side effects; the table only renders the leading checkbox column (gated on
 * `enabled`), reflects `isSelected` per row, and reports toggles. Callbacks take
 * the row itself — no separate row-id accessor is introduced (`getRowId` stays
 * the single source of row identity, used for the React key).
 */
export interface ListSelection<T> {
  /** Render the checkbox column only when true (e.g. RBAC-gated). */
  enabled: boolean;
  isSelected: (row: T) => boolean;
  allSelected: boolean;
  onToggleAll: () => void;
  onToggleRow: (row: T) => void;
  selectAllAriaLabel?: string;
  rowAriaLabel?: (row: T) => string;
}

export interface ListTableProps<T, K extends string = string> {
  /** Already filtered and sorted by the caller. */
  data: T[];
  columns: ListColumn<T, K>[];
  getRowId: (row: T) => number | string;
  /** While true the table area shows a {@link PageLoader} instead of the table. */
  loading: boolean;
  /** Rendered inside a full-width row when `data` is empty (and not loading). */
  emptyState: ReactNode;
  ariaLabel?: string;
  /** Optional screen-reader-only `<caption>`. */
  caption?: ReactNode;
  onRowClick?: (row: T) => void;
  /** Controlled sort. Omit for static (non-sortable) headers. */
  sort?: ListSort<K>;
  /** Optional bulk selection. Omit to render no checkbox column. */
  selection?: ListSelection<T>;
}

/**
 * Presentational list table: header (with controlled sort + `aria-sort`), rows
 * with optional click/keyboard navigation, loading, and empty states. Holds no
 * data-fetching, filtering, or selection logic — those stay in the route.
 */
export function ListTable<T, K extends string = string>({
  data,
  columns,
  getRowId,
  loading,
  emptyState,
  ariaLabel,
  caption,
  onRowClick,
  sort,
  selection,
}: ListTableProps<T, K>) {
  if (loading) return <PageLoader />;

  const clickable = !!onRowClick;
  const showSelect = !!selection?.enabled;
  const colSpan = columns.length + (showSelect ? 1 : 0);

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
      <table className="w-full text-[12px]" aria-label={ariaLabel}>
        {caption != null && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-zinc-200 dark:border-zinc-800">
            {showSelect && (
              <th scope="col" className="px-3 py-2.5 w-8">
                <input
                  type="checkbox"
                  checked={selection!.allSelected}
                  onChange={selection!.onToggleAll}
                  aria-label={selection!.selectAllAriaLabel ?? "Select all"}
                  className="cursor-pointer accent-indigo-500"
                />
              </th>
            )}
            {columns.map((col) => {
              const sortable = col.sortable !== false && !!sort;
              const isSorted = !!sort && sort.sortKey === col.key;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={
                    isSorted
                      ? sort!.sortDir === "asc"
                        ? "ascending"
                        : "descending"
                      : sortable
                        ? "none"
                        : undefined
                  }
                  className={cn(
                    "px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-400 dark:text-zinc-600",
                    col.align === "right" ? "text-right" : "text-left",
                    col.headerClassName,
                  )}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => sort!.onSort(col.key)}
                      className={cn(
                        "inline-flex items-center gap-1 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors",
                        col.align === "right" && "ml-auto",
                      )}
                    >
                      {col.header}
                      {isSorted ? (
                        sort!.sortDir === "asc" ? (
                          <ArrowUp size={11} />
                        ) : (
                          <ArrowDown size={11} />
                        )
                      ) : (
                        <ArrowUpDown size={11} className="opacity-40" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={colSpan}>{emptyState}</td>
            </tr>
          ) : (
            data.map((row, index) => (
              <tr
                key={getRowId(row)}
                {...(clickable
                  ? {
                      tabIndex: 0,
                      role: "row",
                      onClick: () => onRowClick!(row),
                      onKeyDown: (e: React.KeyboardEvent<HTMLTableRowElement>) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick!(row);
                        }
                      },
                    }
                  : {})}
                aria-selected={selection ? selection.isSelected(row) : undefined}
                className={cn(
                  "border-b border-zinc-100 dark:border-zinc-800/60 last:border-0 transition-colors duration-[80ms]",
                  clickable && "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800",
                )}
              >
                {showSelect && (
                  <td
                    className="px-3 py-2.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      selection!.onToggleRow(row);
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selection!.isSelected(row)}
                      onChange={() => selection!.onToggleRow(row)}
                      aria-label={selection!.rowAriaLabel?.(row)}
                      className="cursor-pointer accent-indigo-500"
                    />
                  </td>
                )}
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      "px-3 py-2.5",
                      col.align === "right" && "text-right",
                      col.className,
                    )}
                  >
                    {col.cell
                      ? col.cell(row, index)
                      : String((row as Record<string, unknown>)[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
