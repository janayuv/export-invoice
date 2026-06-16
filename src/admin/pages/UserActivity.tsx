import { useCallback, useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import {
  UserCheck,
  FileText,
  ShoppingCart,
  ClipboardList,
  Users,
  ScrollText,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import {
  getActiveUsers,
  getAuthAuditLog,
  type AuthAuditEntry,
  type User,
} from "@/lib/auth";
import {
  getActivityLog,
  getActivityLogCount,
  type ActivityLogEntry,
} from "@/admin/services/adminApi";

const ALL_USERS = "all";
const AUTH_LIMIT = 50;
const PAGE_SIZE = 25;

const EVENT_META: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  login_success:  { label: "Login",      variant: "default" },
  failed_attempt: { label: "Failed",     variant: "destructive" },
  locked:         { label: "Locked",     variant: "destructive" },
  unlocked:       { label: "Unlocked",   variant: "secondary" },
  pin_changed:    { label: "PIN Change", variant: "outline" },
};

const MODULE_ICON: Record<string, React.ElementType> = {
  invoices:        FileText,
  purchase_orders: ShoppingCart,
  entries:         ClipboardList,
  users:           Users,
};

function stripErrPrefix(e: unknown): string {
  return String(e).replace(/^ERR_\w+:\s*/i, "");
}

export function UserActivity() {
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setUserId] = useState<string>(ALL_USERS);
  const [authEntries, setAuthEntries] = useState<AuthAuditEntry[]>([]);
  const [appEntries, setAppEntries] = useState<ActivityLogEntry[]>([]);
  const [appTotal, setAppTotal] = useState(0);
  const [appPage, setAppPage] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getActiveUsers()
      .then(setUsers)
      .catch((e) => toast.error(stripErrPrefix(e)));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const uid = userId === ALL_USERS ? undefined : Number(userId);
    Promise.all([
      getAuthAuditLog(AUTH_LIMIT, uid),
      getActivityLog(PAGE_SIZE, appPage * PAGE_SIZE, uid ?? null, null),
      getActivityLogCount(uid ?? null, null),
    ])
      .then(([auth, app, count]) => {
        setAuthEntries(auth);
        setAppEntries(app);
        setAppTotal(count);
      })
      .catch((e) => toast.error(stripErrPrefix(e)))
      .finally(() => setLoading(false));
  }, [userId, appPage]);

  useEffect(() => {
    load();
  }, [load]);

  const appTotalPages = Math.max(1, Math.ceil(appTotal / PAGE_SIZE));

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-teal-400/15">
          <UserCheck size={18} className="text-teal-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">User Activity</h1>
          <p className="text-xs text-zinc-500">Auth events and app actions per user.</p>
        </div>
      </div>

      {/* User filter */}
      <Select
        value={userId}
        onValueChange={(v) => {
          setUserId(v ?? ALL_USERS);
          setAppPage(0);
        }}
      >
        <SelectTrigger className="w-52">
          <SelectValue placeholder="All users" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_USERS}>All users</SelectItem>
          {users.map((u) => (
            <SelectItem key={u.id} value={String(u.id)}>
              {u.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Auth events panel */}
          <div className="rounded-xl ring-1 ring-foreground/10 bg-card overflow-auto max-h-[60vh]">
            <div className="px-4 py-3 border-b border-foreground/10">
              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Auth Events
              </p>
            </div>
            {authEntries.length === 0 ? (
              <p className="text-sm text-zinc-500 p-4">No auth events.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>User</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {authEntries.map((e) => {
                    const meta = EVENT_META[e.event_type] ?? {
                      label: e.event_type,
                      variant: "outline" as const,
                    };
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs text-zinc-500 whitespace-nowrap">
                          {e.occurred_at}
                        </TableCell>
                        <TableCell>
                          <Badge variant={meta.variant} className="text-xs">
                            {meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {e.user_id ? `#${e.user_id}` : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          {/* App actions panel */}
          <div className="rounded-xl ring-1 ring-foreground/10 bg-card overflow-auto max-h-[60vh]">
            <div className="px-4 py-3 border-b border-foreground/10">
              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                App Actions
              </p>
            </div>
            {appEntries.length === 0 ? (
              <p className="text-sm text-zinc-500 p-4">No app actions.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Record</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {appEntries.map((a) => {
                    const Icon = MODULE_ICON[a.module] ?? ScrollText;
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="text-xs text-zinc-500 whitespace-nowrap">
                          {a.occurred_at}
                        </TableCell>
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
            <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-foreground/10">
              <span className="text-xs text-zinc-500 tabular-nums mr-auto">
                {appTotal.toLocaleString()} actions · Page {appPage + 1} of {appTotalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={appPage === 0}
                onClick={() => setAppPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft size={14} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={appPage + 1 >= appTotalPages}
                onClick={() => setAppPage((p) => p + 1)}
              >
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
