import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, Pencil, KeyRound, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type User,
  type UserRole,
  type AuthAuditEntry,
  type AuthTelemetry,
  getUsers,
  createUser,
  updateUser,
  changePin,
  getAuthAuditLog,
  getAuthTelemetryWindow,
} from "@/lib/auth";
import { useAuth } from "@/contexts/AuthContext";

// ── Security diagnostics types ────────────────────────────────────────────────

interface SecurityEvent {
  id: number;
  command: string;
  user_id: number | null;
  reason: string;
  occurred_at: string;
}

interface AuthTelemetrySummary {
  window_1h: AuthTelemetry;
  window_24h: AuthTelemetry;
}

interface UserAuthTrend {
  user_id: number;
  user_name: string;
  role: string;
  failed_24h: number;
  lockouts_24h: number;
  login_successes_24h: number;
}

// ─────────────────────────────────────────────────────────────────────────────

type PanelMode = "add" | "edit" | "pin" | null;

const ROLE_COLORS: Record<UserRole, string> = {
  admin: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  operator: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  viewer: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
};

const HASH_BADGE: Record<"argon2" | "legacy-sha256", string> = {
  argon2: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  "legacy-sha256": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

const EVENT_COLORS: Record<string, string> = {
  failed_attempt: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  locked:         "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  unlocked:       "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  login_success:  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  pin_changed:    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

const EVENT_LABELS: Record<string, string> = {
  failed_attempt: "Failed attempt",
  locked:         "Locked",
  unlocked:       "Unlocked",
  login_success:  "Login success",
  pin_changed:    "PIN changed",
};

function formatAuditDetails(json: string): string {
  try {
    const d = JSON.parse(json) as Record<string, unknown>;
    if (d.remaining_attempts !== undefined) return `${d.remaining_attempts} attempts left`;
    if (d.until !== undefined) {
      const untilTime = new Date(String(d.until)).toLocaleTimeString();
      if (d.reason === "active_lockout") return `Locked until ${untilTime}`;
      return `Locked until ${untilTime} (${d.lockout_minutes} min)`;
    }
    if (d.prior_attempts !== undefined) return `After ${d.prior_attempts} failure(s)`;
    return "—";
  } catch {
    return "—";
  }
}

export function UserManagement() {
  const { currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState<UserRole>("operator");
  const [formIsActive, setFormIsActive] = useState(true);
  const [formPin, setFormPin] = useState("");
  const [formPinConfirm, setFormPinConfirm] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [auditLog, setAuditLog] = useState<AuthAuditEntry[]>([]);
  const [telemetry, setTelemetry] = useState<AuthTelemetry | null>(null);
  const [eventFilter, setEventFilter] = useState("");

  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [telemetrySummary, setTelemetrySummary] = useState<AuthTelemetrySummary | null>(null);
  const [userTrends, setUserTrends] = useState<UserAuthTrend[]>([]);
  const [diagLoading, setDiagLoading] = useState(false);

  const loadDiagnostics = useCallback(async () => {
    if (!currentUser || currentUser.role !== "admin") return;
    setDiagLoading(true);
    try {
      const [events, summary, trends] = await Promise.all([
        invoke<SecurityEvent[]>("get_security_events", { limit: 50 }),
        invoke<AuthTelemetrySummary>("get_auth_telemetry_summary"),
        invoke<UserAuthTrend[]>("get_user_auth_trends"),
      ]);
      setSecurityEvents(events);
      setTelemetrySummary(summary);
      setUserTrends(trends);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setDiagLoading(false);
    }
  }, [currentUser]);

  useEffect(() => { loadDiagnostics(); }, [loadDiagnostics]);

  async function load() {
    const list = await getUsers();
    setUsers(list);
  }

  async function loadAudit() {
    try {
      const [log, tel] = await Promise.all([
        getAuthAuditLog(),
        getAuthTelemetryWindow(24),
      ]);
      setAuditLog(log);
      setTelemetry(tel);
    } catch (e) {
      toast.error(`Failed to load audit log: ${e}`);
    }
  }

  useEffect(() => { load(); loadAudit(); }, []);

  function openAdd() {
    setSelectedUser(null);
    setFormName("");
    setFormRole("operator");
    setFormIsActive(true);
    setFormPin("");
    setFormPinConfirm("");
    setPanelMode("add");
  }

  function openEdit(u: User) {
    setSelectedUser(u);
    setFormName(u.name);
    setFormRole(u.role);
    setFormIsActive(u.is_active === 1);
    setFormPin("");
    setFormPinConfirm("");
    setPanelMode("edit");
  }

  function openPin(u: User) {
    setSelectedUser(u);
    setFormPin("");
    setFormPinConfirm("");
    setPanelMode("pin");
  }

  function closePanel() {
    setPanelMode(null);
    setSelectedUser(null);
  }

  async function handleAdd() {
    const trimmed = formName.trim();
    if (!trimmed) { toast.error("Name is required"); return; }
    if (formPin.length < 4 || !/^\d+$/.test(formPin)) {
      toast.error("PIN must be 4–6 digits"); return;
    }
    if (formPin !== formPinConfirm) { toast.error("PINs do not match"); return; }
    setIsSaving(true);
    try {
      await createUser(trimmed, formPin, formRole);
      toast.success("User created");
      closePanel();
      load();
    } catch (e) {
      toast.error(`Error: ${e}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleEdit() {
    if (!selectedUser) return;
    const trimmed = formName.trim();
    if (!trimmed) { toast.error("Name is required"); return; }
    if (selectedUser.id === currentUser?.id && !formIsActive) {
      toast.error("You cannot deactivate your own account"); return;
    }
    setIsSaving(true);
    try {
      await updateUser(selectedUser.id, trimmed, formRole, formIsActive);
      toast.success("User updated");
      closePanel();
      load();
    } catch (e) {
      toast.error(`Error: ${e}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleChangePin() {
    if (!selectedUser) return;
    if (formPin.length < 4 || !/^\d+$/.test(formPin)) {
      toast.error("PIN must be 4–6 digits"); return;
    }
    if (formPin !== formPinConfirm) { toast.error("PINs do not match"); return; }
    setIsSaving(true);
    try {
      await changePin(selectedUser.id, formPin);
      toast.success("PIN changed");
      closePanel();
    } catch (e) {
      toast.error(`Error: ${e}`);
    } finally {
      setIsSaving(false);
    }
  }

  const panelTitle =
    panelMode === "add" ? "Add User" :
    panelMode === "edit" ? `Edit — ${selectedUser?.name}` :
    panelMode === "pin" ? `Change PIN — ${selectedUser?.name}` : "";

  const filteredAudit = eventFilter
    ? auditLog.filter((e) => e.event_type === eventFilter)
    : auditLog;

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">User Management</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage who can access this application
          </p>
        </div>
        {!panelMode && (
          <Button onClick={openAdd} size="sm">
            <Plus size={16} className="mr-1" /> Add User
          </Button>
        )}
      </div>

      {/* Inline form panel */}
      {panelMode && (
        <div className="border rounded-lg bg-card p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-base">{panelTitle}</h3>
            <button
              onClick={closePanel}
              className="p-1 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Name — add & edit only */}
            {(panelMode === "add" || panelMode === "edit") && (
              <div className="space-y-1">
                <Label>Name</Label>
                <Input
                  placeholder="Full name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>
            )}

            {/* Role — add & edit only */}
            {(panelMode === "add" || panelMode === "edit") && (
              <div className="space-y-1">
                <Label>Role</Label>
                <Select
                  value={formRole}
                  onValueChange={(v) => v && setFormRole(v as UserRole)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="operator">Operator</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Active toggle — edit only */}
            {panelMode === "edit" && (
              <div className="col-span-2 flex items-center gap-3">
                <input
                  id="is-active"
                  type="checkbox"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                  disabled={selectedUser?.id === currentUser?.id}
                />
                <Label htmlFor="is-active">Active account</Label>
                {selectedUser?.id === currentUser?.id && (
                  <span className="text-xs text-muted-foreground">(cannot deactivate yourself)</span>
                )}
              </div>
            )}

            {/* PIN fields — add & pin mode */}
            {(panelMode === "add" || panelMode === "pin") && (
              <>
                <div className="space-y-1">
                  <Label>{panelMode === "pin" ? "New PIN (4–6 digits)" : "PIN (4–6 digits)"}</Label>
                  <Input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="••••"
                    value={formPin}
                    onChange={(e) => setFormPin(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Confirm PIN</Label>
                  <Input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="••••"
                    value={formPinConfirm}
                    onChange={(e) => setFormPinConfirm(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={closePanel}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isSaving}
              onClick={
                panelMode === "add" ? handleAdd :
                panelMode === "edit" ? handleEdit :
                handleChangePin
              }
            >
              {isSaving ? "Saving…" :
                panelMode === "add" ? "Create User" :
                panelMode === "edit" ? "Save Changes" :
                "Change PIN"}
            </Button>
          </div>
        </div>
      )}

      {/* Users table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>PIN Hash</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id} className={u.is_active !== 1 ? "opacity-50" : ""}>
                <TableCell className="font-medium">
                  {u.name}
                  {u.id === currentUser?.id && (
                    <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${ROLE_COLORS[u.role]}`}>
                    {u.role}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={u.is_active === 1 ? "default" : "secondary"}>
                    {u.is_active === 1 ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${HASH_BADGE[u.pin_hash_kind ?? "legacy-sha256"]}`}
                    title={u.pin_hash_kind === "argon2" ? "Current secure hash" : "Legacy hash; upgrades on next successful login"}
                  >
                    {u.pin_hash_kind === "argon2" ? "Argon2" : "Legacy SHA-256"}
                  </span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {u.created_at.split("T")[0]}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Edit user"
                      onClick={() => openEdit(u)}
                      disabled={!!panelMode}
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Change PIN"
                      onClick={() => openPin(u)}
                      disabled={!!panelMode}
                    >
                      <KeyRound size={14} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No users found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Auth Audit Log */}
      <div className="border rounded-lg overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between border-b bg-muted/30">
          <div>
            <h3 className="font-semibold text-sm">Auth Audit Log</h3>
            <p className="text-xs text-muted-foreground">Last 50 events · 24-hour summary</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={eventFilter} onValueChange={(v) => setEventFilter(v ?? "")}>
              <SelectTrigger className="h-7 text-xs w-36">
                <SelectValue placeholder="All events" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All events</SelectItem>
                <SelectItem value="failed_attempt">Failed attempt</SelectItem>
                <SelectItem value="locked">Locked</SelectItem>
                <SelectItem value="unlocked">Unlocked</SelectItem>
                <SelectItem value="login_success">Login success</SelectItem>
                <SelectItem value="pin_changed">PIN changed</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={loadAudit} title="Refresh">
              <RefreshCw size={13} />
            </Button>
          </div>
        </div>

        {telemetry && (
          <div className="grid grid-cols-5 divide-x border-b text-center">
            {[
              { label: "Failed", value: telemetry.failed_attempts, color: "text-red-600 dark:text-red-400" },
              { label: "Locked", value: telemetry.lock_events,     color: "text-orange-600 dark:text-orange-400" },
              { label: "Unlocked", value: telemetry.unlock_events, color: "text-green-600 dark:text-green-400" },
              { label: "Logins", value: telemetry.login_successes, color: "text-emerald-600 dark:text-emerald-400" },
              { label: "PIN changes", value: telemetry.pin_changes, color: "text-blue-600 dark:text-blue-400" },
            ].map(({ label, value, color }) => (
              <div key={label} className="py-2 px-3">
                <div className={`text-lg font-bold ${color}`}>{value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs w-28">Time</TableHead>
              <TableHead className="text-xs w-28">User</TableHead>
              <TableHead className="text-xs w-36">Event</TableHead>
              <TableHead className="text-xs">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAudit.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(entry.occurred_at + "Z").toLocaleTimeString()}
                </TableCell>
                <TableCell className="text-xs">
                  {users.find((u) => u.id === entry.user_id)?.name ?? "(unknown)"}
                </TableCell>
                <TableCell>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${EVENT_COLORS[entry.event_type] ?? ""}`}>
                    {EVENT_LABELS[entry.event_type] ?? entry.event_type}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatAuditDetails(entry.details_json)}
                </TableCell>
              </TableRow>
            ))}
            {filteredAudit.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-6 text-sm">
                  No audit events
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {currentUser?.role === "admin" && (
        <div className="mt-8 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Security Diagnostics</h2>
            <button
              onClick={loadDiagnostics}
              disabled={diagLoading}
              className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {diagLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {telemetrySummary && (
            <div className="rounded-lg border p-4">
              <h3 className="font-medium mb-3">Auth Event Counts</h3>
              <table className="text-sm w-full">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="pb-1 pr-8">Metric</th>
                    <th className="pb-1 pr-8">Last 1h</th>
                    <th className="pb-1">Last 24h</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["Failed attempts", "failed_attempts"],
                      ["Lockouts", "lock_events"],
                      ["Unlocks", "unlock_events"],
                      ["Logins", "login_successes"],
                      ["PIN changes", "pin_changes"],
                    ] as [string, keyof AuthTelemetry][]
                  ).map(([label, key]) => (
                    <tr key={key} className="border-b last:border-0">
                      <td className="py-1 pr-8">{label}</td>
                      <td className="py-1 pr-8">{telemetrySummary.window_1h[key]}</td>
                      <td className="py-1">{telemetrySummary.window_24h[key]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {userTrends.length > 0 && (
            <div className="rounded-lg border p-4">
              <h3 className="font-medium mb-3">Per-User Activity (24h)</h3>
              <table className="text-sm w-full">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="pb-1 pr-6">User</th>
                    <th className="pb-1 pr-6">Role</th>
                    <th className="pb-1 pr-6">Failed</th>
                    <th className="pb-1 pr-6">Lockouts</th>
                    <th className="pb-1">Logins</th>
                  </tr>
                </thead>
                <tbody>
                  {userTrends.map((t) => (
                    <tr key={t.user_id} className="border-b last:border-0">
                      <td className="py-1 pr-6">{t.user_name}</td>
                      <td className="py-1 pr-6 text-muted-foreground capitalize">{t.role}</td>
                      <td className={`py-1 pr-6 ${t.failed_24h > 0 ? "text-destructive font-medium" : ""}`}>
                        {t.failed_24h}
                      </td>
                      <td className={`py-1 pr-6 ${t.lockouts_24h > 0 ? "text-destructive font-medium" : ""}`}>
                        {t.lockouts_24h}
                      </td>
                      <td className="py-1">{t.login_successes_24h}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {securityEvents.length > 0 && (
            <div className="rounded-lg border p-4">
              <h3 className="font-medium mb-3">Recent Permission Denials</h3>
              <div className="space-y-0 text-sm max-h-64 overflow-y-auto divide-y">
                {securityEvents.map((e) => (
                  <div key={e.id} className="flex gap-3 py-1">
                    <span className="text-muted-foreground shrink-0 w-40 text-xs">
                      {e.occurred_at.replace("T", " ").replace("Z", " UTC")}
                    </span>
                    <span className="font-mono text-xs shrink-0 w-32 text-amber-600">{e.command}</span>
                    <span className="text-muted-foreground truncate text-xs">{e.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
