import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  Calendar,
  Pencil,
  CheckCircle,
  ShoppingCart,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDb } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { fmtAmount } from "@/lib/invoiceDocument";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stats {
  total: number;
  thisMonth: number;
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

/** Returns last 12 months as { key: "YYYY-MM", label: "Mon 'YY" }[], newest last */
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

const DEST_COLORS = [
  "bg-indigo-400",
  "bg-amber-400",
  "bg-emerald-400",
  "bg-blue-400",
  "bg-zinc-400",
];

// ─── StatCard ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number;
  sub: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  valueColor: string;
  onClick?: () => void;
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  iconBg,
  iconColor,
  valueColor,
  onClick,
}: StatCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-[14px]",
        "transition-[transform,box-shadow] duration-150",
        onClick &&
          "cursor-pointer hover:-translate-y-px hover:shadow-md dark:hover:shadow-zinc-950/60"
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400">
          {label}
        </p>
        <div className={cn("w-7 h-7 rounded-[6px] flex items-center justify-center", iconBg)}>
          <Icon size={14} className={iconColor} />
        </div>
      </div>
      <div
        className={cn(
          "text-[28px] font-bold leading-none tracking-[-0.5px] mb-1",
          valueColor
        )}
      >
        {value}
      </div>
      <p className="text-[11px] text-zinc-400 dark:text-zinc-600">{sub}</p>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export function Dashboard() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [stats, setStats] = useState<Stats>({ total: 0, thisMonth: 0, drafts: 0, finals: 0 });
  const [recent, setRecent] = useState<RecentInvoice[]>([]);
  const [monthlyRaw, setMonthlyRaw] = useState<MonthCount[]>([]);
  const [destinations, setDestinations] = useState<DestCount[]>([]);

  const firstName = currentUser?.name.split(" ")[0] ?? "there";
  const months = getLast12Months();

  // Merge DB results into the fixed 12-slot month array
  const monthlyData = months.map(({ key, label }) => ({
    label,
    count: monthlyRaw.find((m) => m.month === key)?.count ?? 0,
  }));

  const maxMonth = Math.max(1, ...monthlyData.map((m) => m.count));
  const maxDest = Math.max(1, ...destinations.map((d) => d.count));

  useEffect(() => {
    (async () => {
      try {
        const db = await getDb();

        // ── Stat counts ──
        const [total] = await db.select<{ c: number }[]>(
          "SELECT COUNT(*) as c FROM invoices"
        );
        const [thisMonth] = await db.select<{ c: number }[]>(
          "SELECT COUNT(*) as c FROM invoices WHERE strftime('%Y-%m', invoice_date) = strftime('%Y-%m', 'now')"
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
          drafts: drafts.c,
          finals: finals.c,
        });

        // ── Recent invoices (last 5) ──
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

        // ── Monthly volume (last 12 months) ──
        const monthly = await db.select<MonthCount[]>(`
          SELECT strftime('%Y-%m', invoice_date) as month, COUNT(*) as count
          FROM invoices
          WHERE invoice_date >= date('now', '-11 months', 'start of month')
          GROUP BY month
          ORDER BY month ASC
        `);
        setMonthlyRaw(monthly);

        // ── Top destinations ──
        const dests = await db.select<DestCount[]>(`
          SELECT country_of_destination as dest, COUNT(*) as count
          FROM invoices
          WHERE country_of_destination != ''
          GROUP BY country_of_destination
          ORDER BY count DESC
          LIMIT 5
        `);
        setDestinations(dests);
      } catch {
        // DB not available outside the Tauri app
      }
    })();
  }, []);

  const currentMonthLabel = new Date().toLocaleDateString("en-GB", { month: "long" });

  return (
    <div className="p-[18px] space-y-3 animate-fade-up">

      {/* ── Greeting ── */}
      <div>
        <h1 className="text-[20px] font-bold text-zinc-900 dark:text-zinc-50 leading-tight">
          {getGreeting()}, {firstName}
        </h1>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
          {getFullDate()}
        </p>
      </div>

      {/* ── 4 stat cards ── */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard
          label="Total Invoices"
          value={stats.total}
          sub="all time"
          icon={FileText}
          iconBg="bg-zinc-200 dark:bg-zinc-800"
          iconColor="text-zinc-500 dark:text-zinc-400"
          valueColor="text-zinc-900 dark:text-zinc-50"
          onClick={() => navigate("/invoices")}
        />
        <StatCard
          label="This Month"
          value={stats.thisMonth}
          sub={currentMonthLabel}
          icon={Calendar}
          iconBg="bg-indigo-400/15"
          iconColor="text-indigo-400"
          valueColor="text-indigo-400"
          onClick={() => navigate("/invoices")}
        />
        <StatCard
          label="Draft"
          value={stats.drafts}
          sub="pending finalization"
          icon={Pencil}
          iconBg="bg-amber-400/15"
          iconColor="text-amber-400"
          valueColor="text-amber-400"
          onClick={() => navigate("/invoices")}
        />
        <StatCard
          label="Finalized"
          value={stats.finals}
          sub="ready to export"
          icon={CheckCircle}
          iconBg="bg-emerald-400/15"
          iconColor="text-emerald-400"
          valueColor="text-emerald-400"
          onClick={() => navigate("/invoices")}
        />
      </div>

      {/* ── Quick actions ── */}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => navigate("/invoices/new")}>
          New Invoice
        </Button>
        <Button size="sm" variant="outline" onClick={() => navigate("/invoices")}>
          View All Invoices
        </Button>
        <Button size="sm" variant="outline" onClick={() => navigate("/purchase-orders")}>
          <ShoppingCart size={13} className="mr-1.5" />
          Purchase Orders
        </Button>
      </div>

      {/* ── Two-column grid ── */}
      <div className="grid grid-cols-2 gap-3">

        {/* Left: Recent Invoices */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
            <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-50">
              Recent Invoices
            </p>
            <button
              onClick={() => navigate("/invoices")}
              className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5 transition-colors"
            >
              View all <ArrowRight size={11} />
            </button>
          </div>

          {recent.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px] text-zinc-400 dark:text-zinc-600">
              No invoices yet
            </div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  {(["Invoice No", "Consignee", "Amount", "Status"] as const).map((h, i) => (
                    <th
                      key={h}
                      className={cn(
                        "px-4 py-2 text-[10px] font-bold uppercase tracking-[0.06em] text-zinc-400 dark:text-zinc-600",
                        i === 2 ? "text-right" : "text-left"
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => navigate(`/invoices/${inv.id}`)}
                    className="border-b border-zinc-100 dark:border-zinc-800/60 last:border-0 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors duration-[80ms]"
                  >
                    <td className="px-4 py-2.5 font-mono font-semibold text-indigo-400 whitespace-nowrap">
                      {inv.invoice_number}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-700 dark:text-zinc-300 max-w-[120px] truncate">
                      {inv.consignee_name || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                      {inv.currency} {fmtAmount(inv.total)}
                    </td>
                    <td className="px-4 py-2.5">
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
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Right: chart + destinations stacked */}
        <div className="flex flex-col gap-3">

          {/* Export Volume — 12-month bar chart */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
            <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-50 mb-3">
              Export Volume
            </p>
            <div className="flex items-end gap-[3px] h-[72px]">
              {monthlyData.map(({ label, count }, i) => {
                const isCurrent = i === 11;
                // 4% floor keeps zero-months visible; scale rest proportionally
                const heightPct =
                  count === 0 ? 4 : Math.max(8, Math.round((count / maxMonth) * 100));
                return (
                  <div
                    key={label}
                    title={`${label}: ${count}`}
                    className={cn(
                      "flex-1 rounded-t-[3px] transition-all duration-200",
                      isCurrent
                        ? "bg-indigo-400"
                        : "bg-indigo-400/20 dark:bg-indigo-400/15"
                    )}
                    style={{ height: `${heightPct}%` }}
                  />
                );
              })}
            </div>
            {/* Three evenly-spaced axis labels */}
            <div className="flex justify-between mt-1.5">
              <span className="text-[10px] text-zinc-400 dark:text-zinc-600">
                {monthlyData[0].label}
              </span>
              <span className="text-[10px] text-zinc-400 dark:text-zinc-600">
                {monthlyData[5].label}
              </span>
              <span className="text-[10px] text-zinc-400 dark:text-zinc-600">
                {monthlyData[11].label}
              </span>
            </div>
          </div>

          {/* By Destination */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
            <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-50 mb-3">
              By Destination
            </p>
            {destinations.length === 0 ? (
              <p className="text-[11px] text-zinc-400 dark:text-zinc-600">No data yet</p>
            ) : (
              <div className="space-y-2.5">
                {destinations.map((d, i) => (
                  <div key={d.dest}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-zinc-700 dark:text-zinc-300 truncate">
                        {d.dest}
                      </span>
                      <span className="text-[11px] font-semibold text-zinc-900 dark:text-zinc-50 ml-2 flex-shrink-0">
                        {d.count}
                      </span>
                    </div>
                    <div className="h-[5px] rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", DEST_COLORS[i] ?? "bg-zinc-400")}
                        style={{ width: `${Math.round((d.count / maxDest) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
