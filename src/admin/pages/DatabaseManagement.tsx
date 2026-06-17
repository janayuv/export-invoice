import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { toast } from "@/lib/toast";
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
  CloudUpload,
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
          <p className="text-xs text-zinc-500">
            Overview, backup, browse, and audit your database.
          </p>
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
        <h2 className="text-sm font-semibold mb-3 text-zinc-900 dark:text-zinc-50">
          Table Record Counts
        </h2>
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
                <TableCell className="text-right tabular-nums">
                  {t.record_count.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-xl ring-1 ring-foreground/10 bg-card p-4">
        <h2 className="text-sm font-semibold mb-3 text-zinc-900 dark:text-zinc-50">
          Recent Activity
        </h2>
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

// ── Google Drive types ──────────────────────────────────────────────────────────

type GDriveConnectStatus = { connected: boolean; email: string | null };
type OAuthConfigStatus = { client_id: string; has_secret: boolean };
type GDriveBackupResult = {
  file_id: string;
  file_name: string;
  web_view_link: string | null;
  size_bytes: number;
  sha256: string;
  integrity_ok: boolean;
};
type GDriveFile = {
  id: string;
  name: string;
  created_time: string;
  size_bytes: string | null;
  web_view_link: string | null;
};

function BackupTab() {
  const [backupStatus, setBackupStatus] = useState<"creating" | "verifying" | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [backupResult, setBackupResult] = useState<VerifyState>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyState>(null);

  const [gdrive, setGdrive] = useState<GDriveConnectStatus>({ connected: false, email: null });
  const [gdriveConnecting, setGdriveConnecting] = useState(false);
  const [gdriveUploading, setGdriveUploading] = useState(false);
  const [gdriveLastUpload, setGdriveLastUpload] = useState<GDriveBackupResult | null>(null);
  const [gdriveFiles, setGdriveFiles] = useState<GDriveFile[]>([]);
  const [gdriveLoadingFiles, setGdriveLoadingFiles] = useState(false);
  // Passphrase modal state. Passphrases live ONLY in transient React state here —
  // never written to localStorage/SQLite and never logged. Cleared after the
  // backup/restore completes or the modal is cancelled.
  const [showBackupPass, setShowBackupPass] = useState(false);
  const [restorePrompt, setRestorePrompt] = useState<{ fileId: string; fileName: string } | null>(
    null,
  );
  const [restorePassError, setRestorePassError] = useState<string | null>(null);
  const [restoreSubmitting, setRestoreSubmitting] = useState(false);
  const [oauthConfig, setOauthConfig] = useState<OAuthConfigStatus>({
    client_id: "",
    has_secret: false,
  });
  const [savingConfig, setSavingConfig] = useState(false);

  useEffect(() => {
    invoke<GDriveConnectStatus>("gdrive_get_status")
      .then(setGdrive)
      .catch(() => {});
    invoke<OAuthConfigStatus>("gdrive_get_oauth_config")
      .then(setOauthConfig)
      .catch(() => {});
  }, []);

  const handleSaveOAuthConfig = async (clientId: string, clientSecret: string) => {
    setSavingConfig(true);
    try {
      await invoke("gdrive_save_oauth_config", { clientId, clientSecret });
      const updated = await invoke<OAuthConfigStatus>("gdrive_get_oauth_config");
      setOauthConfig(updated);
      toast.success("OAuth credentials saved");
    } catch (err) {
      toast.error(`Save failed: ${stripErrPrefix(err)}`);
    } finally {
      setSavingConfig(false);
    }
  };

  const loadGdriveFiles = useCallback(async () => {
    setGdriveLoadingFiles(true);
    try {
      setGdriveFiles(await invoke<GDriveFile[]>("gdrive_list_backups"));
    } catch (err) {
      if (!String(err).includes("ERR_SCOPE:")) {
        toast.error(`Could not list Drive files: ${stripErrPrefix(err)}`);
      }
    } finally {
      setGdriveLoadingFiles(false);
    }
  }, []);

  const handleGdriveConnect = async () => {
    setGdriveConnecting(true);
    try {
      const status = await invoke<GDriveConnectStatus>("gdrive_start_auth");
      setGdrive(status);
      toast.success(`Connected as ${status.email}`);
      loadGdriveFiles();
    } catch (err) {
      toast.error(`Connection failed: ${stripErrPrefix(err)}`);
    } finally {
      setGdriveConnecting(false);
    }
  };

  const handleGdriveDisconnect = async () => {
    try {
      await invoke("gdrive_disconnect");
      setGdrive({ connected: false, email: null });
      setGdriveFiles([]);
      setGdriveLastUpload(null);
      toast.success("Disconnected from Google Drive");
    } catch (err) {
      toast.error(stripErrPrefix(err));
    }
  };

  const handleScopeError = (err: unknown): boolean => {
    if (String(err).includes("ERR_SCOPE:")) {
      setGdrive({ connected: false, email: null });
      setGdriveFiles([]);
      toast.error(stripErrPrefix(err), { duration: 8000 });
      return true;
    }
    return false;
  };

  // Open the passphrase modal; the actual upload runs in runGdriveBackup once the
  // user confirms a passphrase. New Drive backups are V2 (passphrase-encrypted).
  const handleGdriveBackup = () => setShowBackupPass(true);

  // PASSPHRASE (frontend → Rust): the confirmed passphrase is forwarded as a
  // one-shot `invoke` argument and then dropped. It is never stored or logged.
  const runGdriveBackup = async (passphrase: string) => {
    setShowBackupPass(false);
    setGdriveUploading(true);
    setGdriveLastUpload(null);
    try {
      const result = await invoke<GDriveBackupResult>("gdrive_backup_and_upload", { passphrase });
      setGdriveLastUpload(result);
      toast.success(`Uploaded: ${result.file_name}`);
      loadGdriveFiles();
    } catch (err) {
      if (!handleScopeError(err)) toast.error(`Drive backup failed: ${stripErrPrefix(err)}`);
    } finally {
      setGdriveUploading(false);
    }
  };

  // First restore attempt: pass no passphrase. The backend decrypts V1/plain
  // backups directly; for a V2 backup it returns the `ERR_PASSPHRASE_REQUIRED`
  // marker, which opens the passphrase modal so the user can retry — no restart
  // and no re-selection needed.
  const startGdriveRestore = async (fileId: string, fileName: string) => {
    if (
      !confirm(
        `Restore from "${fileName}"?\n\nThis stages the restore — the app must restart to apply it.`,
      )
    )
      return;
    try {
      await invoke("gdrive_download_and_stage_restore", { fileId, fileName, passphrase: null });
      toast.success("Backup staged — restart the app to complete restore");
    } catch (err) {
      if (String(err).includes("ERR_PASSPHRASE_REQUIRED")) {
        // V2 backup detected → prompt for the passphrase and retry in place.
        setRestorePassError(null);
        setRestorePrompt({ fileId, fileName });
        return;
      }
      if (!handleScopeError(err)) toast.error(`Restore failed: ${stripErrPrefix(err)}`);
    }
  };

  // Modal submit: retry the same restore with the entered passphrase. On a wrong
  // passphrase / corrupt / version error the modal stays open with the message so
  // the user can re-enter without restarting the whole restore flow.
  // PASSPHRASE (frontend → Rust): forwarded as a one-shot arg, never stored/logged.
  const submitRestorePassphrase = async (passphrase: string) => {
    if (!restorePrompt) return;
    setRestoreSubmitting(true);
    setRestorePassError(null);
    try {
      await invoke("gdrive_download_and_stage_restore", {
        fileId: restorePrompt.fileId,
        fileName: restorePrompt.fileName,
        passphrase,
      });
      setRestorePrompt(null); // clears the modal; passphrase state is dropped
      toast.success("Backup staged — restart the app to complete restore");
    } catch (err) {
      if (handleScopeError(err)) {
        setRestorePrompt(null);
        return;
      }
      // Keep the modal open and show the reason (wrong passphrase / corrupt /
      // unsupported version) so the user can retry.
      setRestorePassError(stripErrPrefix(err));
    } finally {
      setRestoreSubmitting(false);
    }
  };

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
    <div className="space-y-4 max-w-4xl">
      <div
        className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-[12px] text-amber-900 dark:text-amber-100"
        role="alert"
      >
        <p className="font-semibold">Backups are not encrypted</p>
        <p className="mt-1 text-[11px] opacity-90 leading-relaxed">
          Database backups are plain SQLite files containing all company, invoice, and user data.
          Store them on encrypted drives or secure locations. Anyone with file access can read the
          contents — treat backup files like sensitive credentials.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            <Button
              onClick={handleRestore}
              disabled={restoring}
              variant="outline"
              className="w-full"
            >
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
            <Button
              onClick={handleVerify}
              disabled={verifying}
              variant="outline"
              className="w-full"
            >
              {verifying ? "Verifying…" : "Verify…"}
            </Button>
          }
          result={verifyResult}
        />
      </div>
      <GDriveCard
        status={gdrive}
        oauthConfig={oauthConfig}
        savingConfig={savingConfig}
        connecting={gdriveConnecting}
        uploading={gdriveUploading}
        lastUpload={gdriveLastUpload}
        files={gdriveFiles}
        loadingFiles={gdriveLoadingFiles}
        onSaveConfig={handleSaveOAuthConfig}
        onConnect={handleGdriveConnect}
        onDisconnect={handleGdriveDisconnect}
        onBackup={handleGdriveBackup}
        onListFiles={loadGdriveFiles}
        onRestore={startGdriveRestore}
      />
      {showBackupPass && (
        <PassphraseModal
          title="Encrypt Drive backup"
          description="Choose a passphrase to encrypt this backup. You'll need it to restore on any machine. It cannot be recovered if lost."
          confirmField
          submitLabel="Create backup"
          submitting={gdriveUploading}
          onSubmit={runGdriveBackup}
          onCancel={() => setShowBackupPass(false)}
        />
      )}
      {restorePrompt && (
        <PassphraseModal
          title="Enter backup passphrase"
          description={`"${restorePrompt.fileName}" is passphrase-protected. Enter the passphrase used when it was created.`}
          submitLabel="Restore"
          submitting={restoreSubmitting}
          error={restorePassError}
          onSubmit={submitRestorePassphrase}
          onCancel={() => {
            setRestorePrompt(null);
            setRestorePassError(null);
          }}
        />
      )}
    </div>
  );
}

// Passphrase entry modal. Used for both backup (with a confirm field) and restore
// (single field). The passphrase is held only in this component's local state and
// is passed to the parent's onSubmit callback; it is never persisted or logged,
// and the local state is discarded when the modal unmounts on close.
function PassphraseModal({
  title,
  description,
  confirmField = false,
  submitLabel,
  submitting = false,
  error = null,
  onSubmit,
  onCancel,
}: {
  title: string;
  description: string;
  confirmField?: boolean;
  submitLabel: string;
  submitting?: boolean;
  error?: string | null;
  onSubmit: (passphrase: string) => void;
  onCancel: () => void;
}) {
  const [pass, setPass] = useState("");
  const [confirm2, setConfirm2] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const MIN_LEN = 8; // mirrors backend MIN_BACKUP_PASSPHRASE_LEN

  const handleSubmit = () => {
    if (pass.length < MIN_LEN) {
      setLocalError(`Passphrase must be at least ${MIN_LEN} characters.`);
      return;
    }
    if (confirmField && pass !== confirm2) {
      setLocalError("Passphrases do not match.");
      return;
    }
    setLocalError(null);
    onSubmit(pass);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl bg-card p-5 ring-1 ring-foreground/10 flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
        <input
          type="password"
          autoFocus
          autoComplete="new-password"
          placeholder="Passphrase"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !confirmField && handleSubmit()}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        {confirmField && (
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Confirm passphrase"
            value={confirm2}
            onChange={(e) => setConfirm2(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        )}
        {(localError || error) && <p className="text-xs text-red-500">{localError || error}</p>}
        <div className="flex gap-2 justify-end pt-1">
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Working…" : submitLabel}
          </Button>
        </div>
      </div>
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

function GDriveCard({
  status,
  oauthConfig,
  savingConfig,
  connecting,
  uploading,
  lastUpload,
  files,
  loadingFiles,
  onSaveConfig,
  onConnect,
  onDisconnect,
  onBackup,
  onListFiles,
  onRestore,
}: {
  status: GDriveConnectStatus;
  oauthConfig: OAuthConfigStatus;
  savingConfig: boolean;
  connecting: boolean;
  uploading: boolean;
  lastUpload: GDriveBackupResult | null;
  files: GDriveFile[];
  loadingFiles: boolean;
  onSaveConfig: (clientId: string, clientSecret: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onBackup: () => void;
  onListFiles: () => void;
  onRestore: (fileId: string, fileName: string) => void;
}) {
  const [clientId, setClientId] = useState(oauthConfig.client_id);
  const [clientSecret, setClientSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [showConfigForm, setShowConfigForm] = useState(!oauthConfig.client_id);

  // Sync clientId when oauthConfig loads
  useEffect(() => {
    setClientId(oauthConfig.client_id);
    setShowConfigForm(!oauthConfig.client_id);
  }, [oauthConfig.client_id]);

  return (
    <div className="rounded-xl ring-1 ring-foreground/10 bg-card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CloudUpload size={16} className="text-indigo-400" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Google Drive Backup
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowConfigForm((v) => !v)}
            className="text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
          >
            {showConfigForm ? "Hide setup" : "OAuth setup"}
          </button>
          {status.connected && (
            <button
              type="button"
              onClick={onDisconnect}
              className="text-[11px] text-zinc-400 hover:text-red-500 transition-colors"
            >
              Disconnect
            </button>
          )}
        </div>
      </div>

      {/* OAuth credentials form */}
      {showConfigForm && (
        <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 p-3 space-y-2.5">
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            Create a <strong>Desktop app</strong> OAuth 2.0 client in{" "}
            <span className="font-mono">
              Google Cloud Console → APIs &amp; Services → Credentials
            </span>
            , enable the Drive API, then paste the credentials below.
          </p>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
              Client ID
            </label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="xxxx.apps.googleusercontent.com"
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs font-mono text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
              Client Secret{" "}
              <span className="font-normal text-zinc-400">(optional — PKCE works without it)</span>
            </label>
            <div className="relative">
              <input
                type={showSecret ? "text" : "password"}
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder={
                  oauthConfig.has_secret
                    ? "••••••••  (saved — leave blank to keep)"
                    : "Paste secret or leave empty"
                }
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs font-mono text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 pr-14"
              />
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400 hover:text-zinc-600"
              >
                {showSecret ? "hide" : "show"}
              </button>
            </div>
          </div>
          <Button
            onClick={() => onSaveConfig(clientId, clientSecret)}
            disabled={savingConfig || !clientId.trim()}
            size="sm"
            className="w-full"
          >
            {savingConfig ? "Saving…" : "Save Credentials"}
          </Button>
        </div>
      )}

      {!status.connected ? (
        /* ── Not connected ── */
        <div className="space-y-3">
          <p className="text-xs text-zinc-500">
            Connect your Google account to back up the database directly to Google Drive. Uses OAuth
            2.0 with PKCE — no password stored, only a revocable access token.
          </p>
          {connecting && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Browser opened — complete authorization then return here…
            </p>
          )}
          <Button
            onClick={onConnect}
            disabled={connecting || !oauthConfig.client_id}
            className="w-full"
          >
            {connecting ? "Waiting for authorization…" : "Connect Google Drive"}
          </Button>
          {!oauthConfig.client_id && (
            <p className="text-[11px] text-zinc-400 text-center">Enter Client ID above to enable</p>
          )}
        </div>
      ) : (
        /* ── Connected ── */
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 text-xs">
            <CheckCircle2 size={13} className="text-emerald-500" />
            <span className="text-zinc-600 dark:text-zinc-300">{status.email}</span>
          </div>

          <Button onClick={onBackup} disabled={uploading} className="w-full">
            {uploading ? "Backing up…" : "Backup to Google Drive"}
          </Button>

          {lastUpload && (
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-3 py-2 space-y-0.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 size={12} />
                <span className="truncate">{lastUpload.file_name}</span>
              </div>
              <div className="text-[11px] text-emerald-700 dark:text-emerald-400">
                {Math.round(lastUpload.size_bytes / 1024)} KB · SHA-256:{" "}
                {lastUpload.sha256.slice(0, 12)}…
              </div>
              {lastUpload.web_view_link && (
                <a
                  href={lastUpload.web_view_link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-indigo-500 hover:underline"
                >
                  View in Google Drive ↗
                </a>
              )}
            </div>
          )}

          {/* Recent backups list */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
                Recent Backups
              </span>
              <button
                type="button"
                onClick={onListFiles}
                disabled={loadingFiles}
                className="text-[11px] text-indigo-400 hover:text-indigo-600 disabled:opacity-40"
              >
                {loadingFiles ? "Loading…" : "Refresh"}
              </button>
            </div>
            {files.length === 0 ? (
              <p className="text-[11px] text-zinc-400">
                {loadingFiles ? "Loading…" : "No backups on Drive yet."}
              </p>
            ) : (
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {files.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center justify-between gap-2 text-[11px] py-0.5"
                  >
                    <span className="text-zinc-600 dark:text-zinc-400 truncate" title={f.name}>
                      {f.name}
                    </span>
                    <div className="flex items-center gap-2 flex-shrink-0 text-zinc-400">
                      {f.size_bytes && <span>{Math.round(Number(f.size_bytes) / 1024)} KB</span>}
                      {f.web_view_link && (
                        <a
                          href={f.web_view_link}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:text-indigo-400"
                        >
                          ↗
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => onRestore(f.id, f.name)}
                        className="text-amber-500 hover:text-amber-400 font-medium"
                      >
                        Restore
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
                    <TableCell className="text-xs text-zinc-500 whitespace-nowrap">
                      {a.occurred_at}
                    </TableCell>
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
