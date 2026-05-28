import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Lock, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PERMISSIONS, getActiveUsers, type User } from "@/lib/auth";

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

function stripErrPrefix(e: unknown): string {
  return String(e).replace(/^ERR_\w+:\s*/i, "");
}

export function RolesPermissions() {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    getActiveUsers()
      .then(setUsers)
      .catch((e) => toast.error(stripErrPrefix(e)));
  }, []);

  const permKeys = Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[];

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
          <p className="text-xs text-zinc-500">Read-only view of the permission matrix.</p>
        </div>
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
              <TableHead className="w-64">Permission</TableHead>
              {ROLES.map((r) => (
                <TableHead key={r} className="capitalize">
                  {r}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {permKeys.map((perm) => (
              <TableRow key={perm}>
                <TableCell className="text-xs font-mono">{perm}</TableCell>
                {ROLES.map((role) => (
                  <TableCell key={role}>
                    {(PERMISSIONS[perm] as readonly string[]).includes(role) ? (
                      <CheckCircle2 size={14} className="text-green-500" />
                    ) : (
                      <span className="text-zinc-300 dark:text-zinc-600">—</span>
                    )}
                  </TableCell>
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
                      className="text-xs capitalize"
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
