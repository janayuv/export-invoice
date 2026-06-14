import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  Calendar,
  DollarSign,
  Pencil,
  ShoppingCart,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDb } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { fmtAmount } from "@/lib/invoiceDocument";
import { cn, relativeTime } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stats {
  total: number;
  thisMonth: number;
  lastMonth: number;
  drafts: number;
  finals: number;
}

interface RecentInvoice {
  id: number;
  invoice_number: string;
  consignee_name: string;
  currency: string;
  status: string;
  total: number;
}

interface MonthCount {
  month: string; // "YYYY-MM"
  count: number;
}

interface DestCount {
  dest: string;
  count: number;
}

interface CurrencyTotal {
  currency: string;
  total: number;
}

interface ActivityEvent {
  entity: string;
  ref: string;
  name: string;
  status: string;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function getFullDate() {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getLast12Months() {
  const months: { key: string; label: string }[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
    months.push({ key, label });
  }
  return months;
}

const DEST_BAR_COLORS = [
  "bg-indigo-500",
  "bg-indigo-400",
  "bg-indigo-300",
  "bg-indigo-200",
  "bg-indigo-100",
];

function monthTrend(thisMonth: number, lastMonth: number): React.ReactNode {
  const diff = thisMonth - lastMonth;
  if (diff === 0) return null;
  const sign = diff > 0 ? "▲" : "▼";
  const color = diff > 0 ? "text-emerald-500" : "text-red-400";
  return (
    <span className={cn("text-[10px] font-semibold", color)}>
      {sign} {diff > 0 ? "+" : ""}
      {diff} vs last month
    </span>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export function Dashboard() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [stats, setStats] = useState<Stats>({ total: 0, thisMonth: 0, lastMonth: 0, drafts: 0, finals: 0 });
  const [recent, setRecent] = useState<RecentInvoice[]>([]);
  const [monthlyRaw, setMonthlyRaw] = useState<MonthCount[]>([]);
  const [destinations, setDestinations] = useState<DestCount[]>([]);
  const [currencyTotals, setCurrencyTotals] = useState<CurrencyTotal[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);

  const firstName = currentUser?.name.split(" ")[0] ?? "there";

  useEffect(() => {
    (async () => {
      try {
        const db = await getDb();

        const [total] = await db.select<{ c: number }[]>(
          "SELECT COUNT(*) as c FROM invoices"
        );
        const [thisMonth] = await db.select<{ c: number }[]>(
          "SELECT COUNT(*) as c FROM invoices WHERE strftime('%Y-%m', invoice_date) = strftime('%Y-%m', 'now')"
        );
        const [lastMonth] = await db.select<{ c: number }[]>(
          "SELECT COUNT(*) as c FROM invoices WHERE strftime('%Y-%m', invoice_date) = strftime('%Y-%m', 'now', '-1 month')"
        );
        const [drafts] = await db.select<{ c: number }[]>(
          "SELECT COUNT(*) as c FROM invoices WHERE status='draft'"
        );
        const [finals] = await db.select<{ c: number }[]>(
          "SELECT COUNT(*) as c FROM invoices WHERE status='final'"
        );
        setStats({
          total: total.c,
          thisMonth: thisMonth.c,
          lastMonth: lastMonth.c,
          drafts: drafts.c,
          finals: finals.c,
        });

        const rows = await db.select<RecentInvoice[]>(`
          SELECT i.id, i.invoice_number, i.consignee_name, i.currency, i.status,
            COALESCE(
              (SELECT SUM(total_amount) FROM invoice_items WHERE invoice_id = i.id),
              0
            ) as total
          FROM invoices i
          ORDER BY i.created_at DESC
          LIMIT 5
        `);
        setRecent(rows);

        const monthly = await db.select<MonthCount[]>(`
          SELECT strftime('%Y-%m', invoice_date) as month, COUNT(*) as count
          FROM invoices
          WHERE invoice_date >= date('now', '-11 months', 'start of month')
          GROUP BY month
          ORDER BY month ASC
        `);
        setMonthlyRaw(monthly);

        const dests = await db.select<DestCount[]>(`
          SELECT country_of_destination as dest, COUNT(*) as count
          FROM invoices
          WHERE country_of_destination != ''
          GROUP BY country_of_destination
          ORDER BY count DESC
          LIMIT 5
        `);
        setDestinations(dests);

        const currTotals = await db.select<CurrencyTotal[]>(`
          SELECT i.currency, COALESCE(SUM(ii.total_amount), 0) as total
          FROM invoices i
          LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
          WHERE strftime('%Y-%m', i.invoice_date) = strftime('%Y-%m', 'now')
          GROUP BY i.currency
          ORDER BY total DESC
          LIMIT 3
        `);
        setCurrencyTotals(currTotals);

        const acts = await db.select<ActivityEvent[]>(`
          SELECT 'invoice' as entity, invoice_number as ref,
                 consignee_name as name, status, created_at
          FROM invoices
          UNION ALL
          SELECT 'po', po_number, customer_name, status, created_at
          FROM purchase_orders
          ORDER BY created_at DESC
          LIMIT 8
        `);
        setActivity(acts);
      } catch {
        // DB not available outside the Tauri app
      }
    })();
  }, []);

  const currentMonthLabel = new Date().toLocaleDateString("en-GB", { month: "long" });
  const months = getLast12Months();
  const monthlyData = months.map(({ key, label }) => ({
    label,
    count: monthlyRaw.find((m) => m.month === key)?.count ?? 0,
  }));
  const maxMonth = Math.max(1, ...monthlyData.map((m) => m.count));
  const maxDest = Math.max(1, ...destinations.map((d) => d.count));
  const thisMonthPct = Math.min(
    100,
    Math.round((stats.thisMonth / Math.max(stats.thisMonth, stats.lastMonth, 1)) * 100)
  );
  const totalPct = Math.min(100, Math.round((stats.total / 100) * 100));

  return (
    <div className="p-[18px] space-y-3 animate-fade-up">

      {/* ── Header row ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[20px] font-black text-zinc-900 dark:text-zinc-50 leading-tight tracking-[-0.3px]">
            {getGreeting()}, {firstName}
          </h1>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
            {getFullDate()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => navigate("/invoices")}>
            View Invoices
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate("/purchase-orders")}>
            <ShoppingCart size={13} className="mr-1.5" />
            Purchase Orders
          </Button>
          <Button size="sm" onClick={() => navigate("/invoices/new")}>
            + New Invoice
          </Button>
        </div>
      </div>

      {/* ── 4 KPI cards ── */}
      <div className="grid grid-cols-4 gap-3">

        {/* Total Invoices */}
        <div
          onClick={() => navigate("/invoices")}
          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[10px] p-[14px] shadow-sm cursor-pointer hover:-translate-y-px hover:shadow-md transition-[transform,box-shadow] duration-150"
        >
          <div className="flex items-start justify-between mb-2.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.07em] text-zinc-400 dark:text-zinc-500">
              Total Invoices
            </p>
            <div className="w-[26px] h-[26px] rounded-[6px] bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
              <FileText size={12} className="text-zinc-500 dark:text-zinc-400" />
            </div>
          </div>
          <div className="text-[32px] font-black leading-none tracking-[-1px] text-zinc-900 dark:text-zinc-50 mb-1.5">
            {stats.total}
          </div>
          <div className="h-[3px] rounded-full bg-zinc-100 dark:bg-zinc-800 mb-1.5">
            <div
              className="h-full rounded-full bg-zinc-300 dark:bg-zinc-600"
              style={{ width: `${totalPct}%` }}
            />
          </div>
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500">all time</p>
        </div>

        {/* This Month */}
        <div
          onClick={() => navigate("/invoices")}
          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[10px] p-[14px] shadow-sm cursor-pointer hover:-translate-y-px hover:shadow-md transition-[transform,box-shadow] duration-150"
        >
          <div className="flex items-start justify-between mb-2.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.07em] text-zinc-400 dark:text-zinc-500">
              This Month
            </p>
            <div className="w-[26px] h-[26px] rounded-[6px] bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center">
              <Calendar size={12} className="text-indigo-500" />
            </div>
          </div>
          <div className="text-[32px] font-black leading-none tracking-[-1px] text-indigo-500 mb-1">
            {stats.thisMonth}
          </div>
          <div className="mb-1.5 h-4">
            {monthTrend(stats.thisMonth, stats.lastMonth)}
          </div>
          <div className="h-[3px] rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-indigo-300 dark:bg-indigo-700"
              style={{ width: `${thisMonthPct}%` }}
            />
          </div>
        </div>

        {/* Export Value */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[10px] p-[14px] shadow-sm">
          <div className="flex items-start justify-between mb-2.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.07em] text-zinc-400 dark:text-zinc-500">
              Export Value · {currentMonthLabel}
            </p>
            <div className="w-[26px] h-[26px] rounded-[6px] bg-green-50 dark:bg-green-950 flex items-center justify-center">
              <DollarSign size={12} className="text-green-600" />
            </div>
          </div>
          {currencyTotals.length === 0 ? (
            <p className="text-[20px] font-black text-zinc-300 dark:text-zinc-600">—</p>
          ) : (
            <div className="space-y-0.5">
              {currencyTotals.map((ct, i) => (
                <div key={ct.currency}>
                  <span
                    className={cn(
                      "font-bold font-mono",
                      i === 0
                        ? "text-[18px] text-green-700 dark:text-green-400"
                        : i === 1
                        ? "text-[13px] text-zinc-600 dark:text-zinc-300"
                        : "text-[11px] text-zinc-400 dark:text-zinc-500"
                    )}
                  >
                    {ct.currency} {fmtAmount(ct.total)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Drafts */}
        <div
          onClick={() => navigate("/invoices")}
          className="bg-white dark:bg-zinc-900 border border-amber-200 dark:border-amber-900/50 rounded-[10px] p-[14px] shadow-sm cursor-pointer hover:-translate-y-px hover:shadow-md transition-[transform,box-shadow] duration-150"
        >
          <div className="flex items-start justify-between mb-2.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.07em] text-amber-600 dark:text-amber-500">
              Drafts
            </p>
            <div className="w-[26px] h-[26px] rounded-[6px] bg-amber-50 dark:bg-amber-950 flex items-center justify-center">
              <Pencil size={12} className="text-amber-500" />
            </div>
          </div>
          <div className="text-[32px] font-black leading-none tracking-[-1px] text-amber-500 mb-1">
            {stats.drafts}
          </div>
          <p className="text-[10px] text-amber-500 font-semibold">⚡ pending finalization</p>
        </div>

      </div>

      {/* ── 3-column bottom grid ── */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "2fr 1.3fr 1fr" }}>

        {/* LEFT: Recent Invoices */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[10px] overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
            <p className="text-[13px] font-bold text-zinc-900 dark:text-zinc-50">Recent Invoices</p>
            <button
              onClick={() => navigate("/invoices")}
              className="flex items-center gap-0.5 text-[11px] text-indigo-500 hover:text-indigo-400 font-medium transition-colors"
            >
              View all <ArrowRight size={11} />
            </button>
          </div>

          {recent.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px] text-zinc-400 dark:text-zinc-600">
              No invoices yet
            </div>
          ) : (
            <>
              <div
                className="grid px-4 py-2 border-b border-zinc-100 dark:border-zinc-800"
                style={{ gridTemplateColumns: "1.2fr 1.5fr 1fr auto" }}
              >
                {(["Invoice No", "Consignee", "Amount", "Status"] as const).map((h, i) => (
                  <div
                    key={h}
                    className={cn(
                      "text-[9px] font-bold uppercase tracking-[0.07em] text-zinc-400 dark:text-zinc-600",
                      i === 2 ? "text-right" : ""
                    )}
                  >
                    {h}
                  </div>
                ))}
              </div>
              {recent.map((inv) => (
                <div
                  key={inv.id}
                  onClick={() => navigate(`/invoices/${inv.id}`)}
                  className="grid items-center px-4 py-2.5 border-b border-zinc-50 dark:border-zinc-800/60 last:border-0 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors duration-75"
                  style={{ gridTemplateColumns: "1.2fr 1.5fr 1fr auto" }}
                >
                  <span className="font-mono text-[11px] font-bold text-indigo-500 truncate">
                    {inv.invoice_number}
                  </span>
                  <span className="text-[11px] text-zinc-600 dark:text-zinc-300 truncate pr-2">
                    {inv.consignee_name || "—"}
                  </span>
                  <span className="text-[11px] font-mono font-semibold text-zinc-700 dark:text-zinc-200 text-right whitespace-nowrap">
                    {inv.currency} {fmtAmount(inv.total)}
                  </span>
                  <span
                    className={cn(
                      "ml-2 inline-flex items-center px-[7px] py-[2px] rounded-full text-[9px] font-bold uppercase tracking-wide whitespace-nowrap",
                      inv.status === "final"
                        ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                    )}
                  >
                    {inv.status}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>

        {/* MIDDLE: Export Volume + By Destination */}
        <div className="flex flex-col gap-3">

          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[10px] p-4 shadow-sm flex-1">
            <p className="text-[13px] font-bold text-zinc-900 dark:text-zinc-50 mb-3">
              Export Volume
            </p>
            <svg
              viewBox="0 0 220 80"
              xmlns="http://www.w3.org/2000/svg"
              className="w-full overflow-visible"
            >
              <line x1="0" y1="20" x2="220" y2="20" stroke="#f4f4f5" strokeWidth="1" />
              <line x1="0" y1="40" x2="220" y2="40" stroke="#f4f4f5" strokeWidth="1" />
              <line x1="0" y1="60" x2="220" y2="60" stroke="#f4f4f5" strokeWidth="1" />
              {monthlyData.map(({ label, count }, i) => {
                const isCurrent = i === 11;
                const heightPct = count === 0 ? 4 : Math.max(8, Math.round((count / maxMonth) * 100));
                const barH = Math.round((heightPct / 100) * 70);
                const x = i * 18 + 1;
                const y = 70 - barH;
                return (
                  <g key={label}>
                    <rect x={x} y={y} width="14" height={barH} rx="2" fill={isCurrent ? "#6366f1" : "#e0e7ff"} />
                    <title>{label}: {count}</title>
                  </g>
                );
              })}
              <text x="8"   y="79" textAnchor="middle" fontSize="7" fill="#9ca3af">{monthlyData[0]?.label}</text>
              <text x="109" y="79" textAnchor="middle" fontSize="7" fill="#9ca3af">{monthlyData[5]?.label}</text>
              <text x="212" y="79" textAnchor="middle" fontSize="7" fill="#6366f1" fontWeight="600">{monthlyData[11]?.label}</text>
            </svg>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[10px] p-4 shadow-sm">
            <p className="text-[13px] font-bold text-zinc-900 dark:text-zinc-50 mb-3">
              By Destination
            </p>
            {destinations.length === 0 ? (
              <p className="text-[11px] text-zinc-400 dark:text-zinc-600">No data yet</p>
            ) : (
              <div className="space-y-2.5">
                {destinations.map((d, i) => (
                  <div key={d.dest}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-zinc-600 dark:text-zinc-300 truncate">
                        {d.dest}
                      </span>
                      <span className="text-[11px] font-bold text-zinc-900 dark:text-zinc-50 ml-2 flex-shrink-0">
                        {d.count}
                      </span>
                    </div>
                    <div className="h-[5px] rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", DEST_BAR_COLORS[i] ?? "bg-indigo-100")}
                        style={{ width: `${Math.round((d.count / maxDest) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* RIGHT: Activity Feed */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[10px] p-4 shadow-sm">
          <p className="text-[13px] font-bold text-zinc-900 dark:text-zinc-50 mb-4">
            Activity
          </p>
          {activity.length === 0 ? (
            <p className="text-[11px] text-zinc-400 dark:text-zinc-600">No activity yet</p>
          ) : (
            <div>
              {activity.map((ev, i) => {
                const isLast = i === activity.length - 1;
                const dotColor =
                  ev.entity === "po"
                    ? "bg-amber-400"
                    : ev.status === "final"
                    ? "bg-emerald-500"
                    : "bg-indigo-500";
                const label =
                  ev.entity === "po"
                    ? `${ev.ref} created`
                    : ev.status === "final"
                    ? `${ev.ref} finalized`
                    : `${ev.ref} created`;
                return (
                  <div key={`${ev.entity}-${ev.ref}-${i}`} className="flex gap-2.5">
                    <div className="flex flex-col items-center flex-shrink-0 w-[7px]">
                      <div className={cn("w-[7px] h-[7px] rounded-full mt-[3px]", dotColor)} />
                      {!isLast && (
                        <div className="w-px bg-zinc-200 dark:bg-zinc-700 flex-1 mt-[3px]" />
                      )}
                    </div>
                    <div className={cn("pb-3 min-w-0", isLast && "pb-0")}>
                      <p className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-100 truncate">
                        {label}
                      </p>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                        {ev.name || "—"}
                      </p>
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                        {relativeTime(ev.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
