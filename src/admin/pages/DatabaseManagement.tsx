import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import {
  Database,
  HardDrive,
  Download,
  Upload,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Table as TableIcon,
  ScrollText,
  FileText,
  ShoppingCart,
  ClipboardList,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  adminDbOverview,
  adminBrowseTable,
  getActivityLog,
  getActivityLogCount,
  type TableStat,
  type ActivityLogEntry,
  type BrowseResult,
} from "@/admin/services/adminApi";

// ── shared local types ──────────────────────────────────────────────────────────

type TabKey = "overview" | "backup" | "browse" | "audit";
type VerifyState = { sizeKb: number; ok: boolean; sha256: string } | null;
type BackupInfo = {
  size_bytes: number;
  integrity_status: string;
  table_count: number;
  user_version: number;
  sha256: string;
  checked_at: string;
};

// ── helpers ──────────────────────────────────────────────────────────────────────

function stripErrPrefix(err: unknown): string {
  return String(err).replace(/^ERR_\w+:\s*/i, "");
}

const MODULE_ICON: Record<string, React.ElementType> = {
  invoices: FileText,
  purchase_orders: ShoppingCart,
  entries: ClipboardList,
  users: Users,
};

// ── tab navigation ─────────────────────────────────────────────────────────────

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "overview", label: "Overview", icon: HardDrive },
  { key: "backup", label: "Backup / Restore", icon: Download },
  { key: "browse", label: "Browse", icon: TableIcon },
  { key: "audit", label: "Audit", icon: ScrollText },
];

export function DatabaseManagement() {
  const [tab, setTab] = useState<TabKey>("overview");

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-400/15">
          <Database size={18} className="text-indigo-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Database Management</h1>
          <p className="text-xs text-zinc-500">Overview, backup, browse, and audit your database.</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={
              "flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors " +
              (tab === key
                ? "border-indigo-400 text-indigo-400"
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200")
            }
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab />}
      {tab === "backup" && <BackupTab />}
      {tab === "browse" && <BrowseTab />}
      {tab === "audit" && <AuditTab />}
    </div>
  );
}

// ── Tab 1: Overview ─────────────────────────────────────────────────────────────

function OverviewTab() {
  const [tables, setTables] = useState<TableStat[]>([]);
  const [recent, setRecent] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminDbOverview()
      .then((r) => {
        setTables(r.tables);
        setRecent(r.recent_activity);
      })
      .catch((e) => toast.error(stripErrPrefix(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-zinc-500">Loading…</p>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="rounded-xl ring-1 ring-foreground/10 bg-card p-4">
        <h2 className="text-sm font-semibold mb-3 text-zinc-900 dark:text-zinc-50">Table Record Counts</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Table</TableHead>
              <TableHead className="text-right">Rows</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tables.map((t) => (
              <TableRow key={t.table_name}>
                <TableCell className="font-mono text-xs">{t.table_name}</TableCell>
                <TableCell className="text-right tabular-nums">{t.record_count.toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-xl ring-1 ring-foreground/10 bg-card p-4">
        <h2 className="text-sm font-semibold mb-3 text-zinc-900 dark:text-zinc-50">Recent Activity</h2>
        {recent.length === 0 ? (
          <p className="text-xs text-zinc-500">No activity recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {recent.map((a) => {
              const Icon = MODULE_ICON[a.module] ?? ScrollText;
              return (
                <li key={a.id} className="flex items-start gap-2 text-xs">
                  <Icon size={14} className="text-zinc-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-zinc-800 dark:text-zinc-200">
                      <span className="font-semibold">{a.action}</span>
                      {a.record_ref && <span className="text-zinc-500"> · {a.record_ref}</span>}
                    </div>
                    <div className="text-zinc-400">
                      {a.user_name || "system"} · {a.occurred_at}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Tab 2: Backup / Restore ─────────────────────────────────────────────────────

function BackupTab() {
  const [backupStatus, setBackupStatus] = useState<"creating" | "verifying" | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [backupResult, setBackupResult] = useState<VerifyState>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyState>(null);

  const handleBackup = async () => {
    setBackupResult(null);
    setVerifyResult(null);
    const stamp = new Date().toISOString().slice(0, 19).replace("T", "_").replace(/:/g, "-");
    try {
      const destPath = await save({
        title: "Save Database Backup",
        defaultPath: `export_invoice_backup_${stamp}.db`,
        filters: [{ name: "SQLite Database", extensions: ["db"] }],
      });
      if (!destPath) return;
      setBackupStatus("creating");
      await invoke("backup_database", { destPath });
      setBackupStatus("verifying");
      const info = await invoke<BackupInfo>("verify_backup", { path: destPath });
      const ok = info.integrity_status === "ok";
      setBackupResult({ sizeKb: Math.round(info.size_bytes / 1024), ok, sha256: info.sha256 });
      toast.success(ok ? "Backup created and verified" : "Backup written — integrity warning");
    } catch (err) {
      toast.error(`Backup failed: ${stripErrPrefix(err)}`);
    } finally {
      setBackupStatus(null);
    }
  };

  const handleRestore = async () => {
    try {
      const sourcePath = await open({
        title: "Select Backup to Restore",
        multiple: false,
        directory: false,
        filters: [{ name: "SQLite Database", extensions: ["db", "sqlite", "sqlite3"] }],
      });
      if (typeof sourcePath !== "string") return;
      setRestoring(true);
      await invoke("validate_and_stage_restore", { sourcePath });
      toast.success("Backup validated — restart the app to complete restore");
    } catch (err) {
      toast.error(`Restore failed: ${stripErrPrefix(err)}`);
    } finally {
      setRestoring(false);
    }
  };

  const handleVerify = async () => {
    setVerifyResult(null);
    try {
      const path = await open({
        title: "Select Backup to Verify",
        multiple: false,
        directory: false,
        filters: [{ name: "SQLite Database", extensions: ["db", "sqlite", "sqlite3"] }],
      });
      if (typeof path !== "string") return;
      setVerifying(true);
      const info = await invoke<BackupInfo>("verify_backup", { path });
      const ok = info.integrity_status === "ok";
      setVerifyResult({ sizeKb: Math.round(info.size_bytes / 1024), ok, sha256: info.sha256 });
      if (ok) toast.success("Backup file is valid");
      else toast.error("Backup file failed integrity check");
    } catch (err) {
      toast.error(`Could not verify: ${stripErrPrefix(err)}`);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl">
      <ActionCard
        icon={Download}
        title="Create Backup"
        desc="Save a verified snapshot of the current database to a file."
        button={
          <Button onClick={handleBackup} disabled={backupStatus !== null} className="w-full">
            {backupStatus === "creating"
              ? "Creating…"
              : backupStatus === "verifying"
                ? "Verifying…"
                : "Create Backup"}
          </Button>
        }
        result={backupResult}
      />
      <ActionCard
        icon={Upload}
        title="Restore Backup"
        desc="Validate a backup file and stage it. Takes effect after restart."
        button={
          <Button onClick={handleRestore} disabled={restoring} variant="outline" className="w-full">
            {restoring ? "Validating…" : "Restore…"}
          </Button>
        }
        result={null}
      />
      <ActionCard
        icon={ShieldCheck}
        title="Verify Backup"
        desc="Check the integrity and SHA-256 hash of a backup file."
        button={
          <Button onClick={handleVerify} disabled={verifying} variant="outline" className="w-full">
            {verifying ? "Verifying…" : "Verify…"}
          </Button>
        }
        result={verifyResult}
      />
    </div>
  );
}

function ActionCard({
  icon: Icon,
  title,
  desc,
  button,
  result,
}: {
  icon: React.ElementType;
  title: string;
  desc: string;
  button: React.ReactNode;
  result: VerifyState;
}) {
  return (
    <div className="rounded-xl ring-1 ring-foreground/10 bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Icon size={16} className="text-indigo-400" />
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
      </div>
      <p className="text-xs text-zinc-500 flex-1">{desc}</p>
      {button}
      {result && (
        <div className="flex items-center gap-1.5 text-xs">
          {result.ok ? (
            <CheckCircle2 size={13} className="text-emerald-500" />
          ) : (
            <XCircle size={13} className="text-red-500" />
          )}
          <span className="text-zinc-500">
            {result.sizeKb} KB · {result.sha256.slice(0, 8)}…
          </span>
        </div>
      )}
    </div>
  );
}

// ── Tab 3: Browse ────────────────────────────────────────────────────────────────

const PAGE_SIZES = [25, 50, 100];

function BrowseTab() {
  const [tableNames, setTableNames] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [data, setData] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    adminDbOverview()
      .then((r) => {
        const names = r.tables.map((t) => t.table_name);
        setTableNames(names);
        if (names.length && !selected) setSelected(names[0]);
      })
      .catch((e) => toast.error(stripErrPrefix(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(() => {
    if (!selected) return;
    setLoading(true);
    adminBrowseTable(selected, page, pageSize)
      .then(setData)
      .catch((e) => toast.error(stripErrPrefix(e)))
      .finally(() => setLoading(false));
  }, [selected, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={selected}
          onValueChange={(v) => {
            setSelected(v ?? "");
            setPage(0);
          }}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Select a table" />
          </SelectTrigger>
          <SelectContent>
            {tableNames.map((n) => (
              <SelectItem key={n} value={n}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={String(pageSize)}
          onValueChange={(v) => {
            setPageSize(Number(v));
            setPage(0);
          }}
        >
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s} / page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-xs text-zinc-500 ml-auto tabular-nums">
          {total.toLocaleString()} rows
        </span>
      </div>

      <div className="rounded-xl ring-1 ring-foreground/10 bg-card overflow-auto max-h-[60vh]">
        {loading ? (
          <p className="text-sm text-zinc-500 p-4">Loading…</p>
        ) : !data || data.rows.length === 0 ? (
          <p className="text-sm text-zinc-500 p-4">No rows.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {data.columns.map((c) => (
                  <TableHead key={c} className="whitespace-nowrap font-mono text-[11px]">
                    {c}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row, i) => (
                <TableRow key={i}>
                  {data.columns.map((c) => (
                    <TableCell key={c} className="whitespace-nowrap text-xs max-w-xs truncate">
                      {String((row as Record<string, string>)[c] ?? "")}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-zinc-500 tabular-nums">
          Page {page + 1} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          <ChevronLeft size={14} />
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page + 1 >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}

// ── Tab 4: Audit ─────────────────────────────────────────────────────────────────

const AUDIT_PAGE_SIZE = 50;

function AuditTab() {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getActivityLog(AUDIT_PAGE_SIZE, page * AUDIT_PAGE_SIZE, null, null),
      getActivityLogCount(null, null),
    ])
      .then(([rows, count]) => {
        setEntries(rows);
        setTotal(count);
      })
      .catch((e) => toast.error(stripErrPrefix(e)))
      .finally(() => setLoading(false));
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));

  return (
    <div className="space-y-3">
      <div className="rounded-xl ring-1 ring-foreground/10 bg-card overflow-auto max-h-[60vh]">
        {loading ? (
          <p className="text-sm text-zinc-500 p-4">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-zinc-500 p-4">No audit entries.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Record</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((a) => {
                const Icon = MODULE_ICON[a.module] ?? ScrollText;
                return (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs text-zinc-500 whitespace-nowrap">{a.occurred_at}</TableCell>
                    <TableCell className="text-xs">{a.user_name || "system"}</TableCell>
                    <TableCell className="text-xs font-medium">{a.action}</TableCell>
                    <TableCell className="text-xs">
                      <span className="inline-flex items-center gap-1 text-zinc-500">
                        <Icon size={12} /> {a.module}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{a.record_ref}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-zinc-500 tabular-nums">
          {total.toLocaleString()} entries · Page {page + 1} of {totalPages}
        </span>
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
          <ChevronLeft size={14} />
        </Button>
        <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
          <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}
