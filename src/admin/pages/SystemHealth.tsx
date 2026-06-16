import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "@/lib/toast";
import { HeartPulse, Database, Shield, Clock, Users, FileText, ScrollText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSystemHealth, type SystemHealthMetrics } from "@/admin/services/adminApi";
import { userMessageFromError } from "@/lib/errors";

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function MetricCard({
  title,
  icon: Icon,
  iconClass = "text-zinc-400",
  children,
}: {
  title: string;
  icon: React.ElementType;
  iconClass?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Icon size={15} className={iconClass} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">{children}</CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-xs font-medium">{value}</span>
    </div>
  );
}

export function SystemHealth() {
  const [metrics, setMetrics] = useState<SystemHealthMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    getSystemHealth()
      .then(setMetrics)
      .catch((e) => toast.error(userMessageFromError(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-green-400/15">
            <HeartPulse size={18} className="text-green-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">System Health</h1>
            <p className="text-xs text-zinc-500">Auto-refreshes every 30 seconds.</p>
          </div>
        </div>
        <Link
          to="/admin/log-viewer"
          className="inline-flex items-center justify-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md border border-input bg-background hover:bg-accent"
        >
          <ScrollText size={14} />
          View application log
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : metrics ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <MetricCard title="Application" icon={FileText} iconClass="text-indigo-400">
            <Row label="Schema version" value={`v${metrics.migration_version}`} />
          </MetricCard>

          <MetricCard title="Database" icon={Database} iconClass="text-blue-400">
            <Row label="Size"      value={fmtBytes(metrics.db_size_bytes)} />
            <Row label="Pages"     value={metrics.db_page_count.toLocaleString()} />
            <Row label="Page size" value={`${metrics.db_page_size} B`} />
          </MetricCard>

          <MetricCard
            title="Integrity"
            icon={Shield}
            iconClass={metrics.integrity_ok ? "text-green-500" : "text-red-500"}
          >
            <Row
              label="Status"
              value={
                <span className={metrics.integrity_ok ? "text-green-600" : "text-red-600"}>
                  {metrics.integrity_ok ? "✓ OK" : "✗ Errors detected"}
                </span>
              }
            />
          </MetricCard>

          <MetricCard title="Backup" icon={Clock} iconClass="text-amber-400">
            <Row label="Last backup" value={metrics.last_backup_at ?? "Never"} />
          </MetricCard>

          <MetricCard title="Users" icon={Users} iconClass="text-teal-400">
            <Row label="Active" value={metrics.active_users} />
            <Row label="Total"  value={metrics.total_users} />
          </MetricCard>

          <MetricCard title="Documents" icon={FileText} iconClass="text-violet-400">
            <Row label="Invoices"        value={metrics.invoice_count.toLocaleString()} />
            <Row label="Purchase Orders" value={metrics.po_count.toLocaleString()} />
            <Row label="Entries"         value={metrics.entry_count.toLocaleString()} />
          </MetricCard>
        </div>
      ) : (
        <p className="text-sm text-zinc-500">No data available.</p>
      )}
    </div>
  );
}
