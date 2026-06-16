import { useCallback, useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import { Lock, CheckCircle2, XCircle, Info, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PERMISSIONS,
  getActiveUsers,
  getRolePermissions,
  setRolePermission,
  type RolePermissionRow,
  type User,
} from "@/lib/auth";
import { cn } from "@/lib/utils";

const ROLES = ["admin", "operator", "viewer"] as const;
type Role = (typeof ROLES)[number];

const ROLE_DESC: Record<Role, string> = {
  admin:    "Full access — manage users, settings, finalize and delete documents.",
  operator: "Create and edit invoices and purchase orders; cannot manage users or settings.",
  viewer:   "Read-only access — view and export documents only.",
};

const ROLE_VARIANT: Record<Role, "default" | "secondary" | "destructive" | "outline"> = {
  admin:    "destructive",
  operator: "default",
  viewer:   "secondary",
};

const PERMISSION_LABELS: Record<string, string> = {
  view_invoices:          "View Invoices",
  export_invoice:         "Export Invoice",
  create_invoice:         "Create Invoice",
  create_purchase_order:  "Create Purchase Order",
  edit_invoice:           "Edit Draft Invoice",
  edit_final_invoice:     "Edit Final Invoice",
  edit_confirmed_po:      "Edit Confirmed PO",
  finalize_invoice:       "Finalize Invoice",
  delete_invoice:         "Delete Invoice",
  access_settings:        "Access Settings",
  manage_users:           "Manage Users",
  view_database_mgmt:     "Database Management",
  view_activity_log:      "Activity Log",
  view_user_activity:     "User Activity",
  view_system_health:     "System Health",
  view_security_center:   "Security Center",
  view_roles_permissions: "Roles & Permissions",
  view_automation:        "Automation Center",
  view_operations:        "Operations Center",
  view_system_agent:      "System Agent",
};

function stripErrPrefix(e: unknown): string {
  return String(e).replace(/^ERR_\w+:\s*/i, "");
}

export function RolesPermissions() {
  const [users, setUsers] = useState<User[]>([]);
  const [dbPerms, setDbPerms] = useState<RolePermissionRow[]>([]);
  const [saving, setSaving] = useState<string | null>(null); // "role:perm" while in-flight

  const loadDbPerms = useCallback(() => {
    getRolePermissions()
      .then(setDbPerms)
      .catch((e) => toast.error(stripErrPrefix(e)));
  }, []);

  useEffect(() => {
    getActiveUsers()
      .then(setUsers)
      .catch((e) => toast.error(stripErrPrefix(e)));
    loadDbPerms();
  }, [loadDbPerms]);

  const permKeys = Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[];

  const grantMap = new Map<string, boolean>(
    dbPerms.map((r) => [`${r.role}:${r.permission}`, r.granted])
  );

  const handleToggle = async (role: "operator" | "viewer", perm: string, current: boolean) => {
    const key = `${role}:${perm}`;
    setSaving(key);
    try {
      await setRolePermission(role, perm, !current);
      loadDbPerms();
      const label = PERMISSION_LABELS[perm] ?? perm;
      toast.success(`"${label}" ${!current ? "granted to" : "revoked from"} ${role}`);
    } catch (e) {
      toast.error(stripErrPrefix(e));
    } finally {
      setSaving(null);
    }
  };

  const renderCell = (perm: string, role: Role) => {
    if (role === "admin") {
      return (
        <div className="flex items-center gap-1.5">
          <CheckCircle2 size={13} className="text-green-500 shrink-0" />
          <span className="text-xs font-medium text-green-600 dark:text-green-400">Granted</span>
        </div>
      );
    }

    const key = `${role}:${perm}`;
    if (!grantMap.has(key)) {
      return <span className="text-zinc-300 dark:text-zinc-600 text-xs">—</span>;
    }

    const granted = grantMap.get(key)!;
    const inFlight = saving === key;

    return (
      <div className="flex items-center gap-2 min-w-[120px]">
        {inFlight ? (
          <Loader2 size={14} className="animate-spin text-zinc-400 shrink-0" />
        ) : (
          <Switch
            checked={granted}
            disabled={false}
            onCheckedChange={() => handleToggle(role, perm, granted)}
            aria-label={`${granted ? "Revoke" : "Grant"} ${PERMISSION_LABELS[perm] ?? perm} for ${role}`}
          />
        )}
        {inFlight ? (
          <span className="text-xs text-zinc-400">Saving…</span>
        ) : granted ? (
          <div className="flex items-center gap-1">
            <CheckCircle2 size={11} className="text-green-500 shrink-0" />
            <span className="text-xs font-medium text-green-600 dark:text-green-400">Granted</span>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <XCircle size={11} className="text-zinc-400 shrink-0" />
            <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500">Revoked</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-violet-400/15">
          <Lock size={18} className="text-violet-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
            Roles &amp; Permissions
          </h1>
          <p className="text-xs text-zinc-500">
            Changes are saved automatically. New permissions take effect on the user's next login.
          </p>
        </div>
      </div>

      {/* Info callout */}
      <div className="flex items-start gap-2 rounded-lg border border-violet-400/30 bg-violet-400/5 px-4 py-3 text-xs text-violet-700 dark:text-violet-300">
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>
          Admin permissions are fixed and cannot be changed. Toggles are shown only for
          permissions that can be delegated to operator and viewer roles.
        </span>
      </div>

      {/* Role description cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {ROLES.map((role) => (
          <Card key={role}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                <Badge variant={ROLE_VARIANT[role]} className="capitalize">
                  {role}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-zinc-500">{ROLE_DESC[role]}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Permission matrix */}
      <div className="rounded-xl ring-1 ring-foreground/10 bg-card overflow-auto">
        <div className="px-4 py-3 border-b border-foreground/10">
          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            Permission Matrix
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-60">Permission</TableHead>
              {ROLES.map((r) => (
                <TableHead key={r} className="capitalize">{r}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {permKeys.map((perm) => (
              <TableRow key={perm}>
                <TableCell>
                  <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                    {PERMISSION_LABELS[perm] ?? perm}
                  </p>
                  <p className="text-[10px] font-mono text-zinc-400 mt-0.5">{perm}</p>
                </TableCell>
                {ROLES.map((role) => (
                  <TableCell key={role}>{renderCell(perm, role)}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* User assignments */}
      <div className="rounded-xl ring-1 ring-foreground/10 bg-card overflow-auto">
        <div className="px-4 py-3 border-b border-foreground/10">
          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            User Assignments
          </p>
        </div>
        {users.length === 0 ? (
          <p className="text-sm text-zinc-500 p-4">No active users.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Since</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="text-sm font-medium">{u.name}</TableCell>
                  <TableCell>
                    <Badge
                      variant={ROLE_VARIANT[u.role as Role] ?? "outline"}
                      className={cn("text-xs capitalize")}
                    >
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-zinc-500">{u.created_at}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
