import { useCallback, useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Search,
  FileText,
  ShoppingCart,
  ClipboardList,
  Users,
  ScrollText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { getActiveUsers, type User } from "@/lib/auth";
import {
  getActivityLog,
  getActivityLogCount,
  type ActivityLogEntry,
} from "@/admin/services/adminApi";

const PAGE_SIZES = [25, 50, 100];
const ALL_USERS = "all";

const MODULE_ICON: Record<string, React.ElementType> = {
  invoices: FileText,
  purchase_orders: ShoppingCart,
  entries: ClipboardList,
  users: Users,
};

function stripErrPrefix(err: unknown): string {
  return String(err).replace(/^ERR_\w+:\s*/i, "");
}

export function ActivityLog() {
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setUserId] = useState<string>(ALL_USERS);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);

  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getActiveUsers()
      .then(setUsers)
      .catch((e) => toast.error(stripErrPrefix(e)));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const uid = userId === ALL_USERS ? null : Number(userId);
    const term = search.trim() || null;
    Promise.all([
      getActivityLog(pageSize, page * pageSize, uid, term),
      getActivityLogCount(uid, term),
    ])
      .then(([rows, count]) => {
        setEntries(rows);
        setTotal(count);
      })
      .catch((e) => toast.error(stripErrPrefix(e)))
      .finally(() => setLoading(false));
  }, [userId, search, pageSize, page]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const applySearch = () => {
    setPage(0);
    setSearch(searchInput);
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-400/15">
          <Activity size={18} className="text-indigo-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Activity Log</h1>
          <p className="text-xs text-zinc-500">Every create, update, and delete across the app.</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={userId}
          onValueChange={(v) => {
            setUserId(v ?? ALL_USERS);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-48">
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

        <div className="flex items-center gap-1.5">
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applySearch()}
            placeholder="Search action, module, record…"
            className="w-64"
          />
          <Button variant="outline" size="sm" onClick={applySearch}>
            <Search size={14} />
          </Button>
        </div>

        <Select
          value={String(pageSize)}
          onValueChange={(v) => {
            setPageSize(Number(v ?? 25));
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
          {total.toLocaleString()} entries
        </span>
      </div>

      <div className="rounded-xl ring-1 ring-foreground/10 bg-card overflow-auto max-h-[65vh]">
        {loading ? (
          <p className="text-sm text-zinc-500 p-4">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-zinc-500 p-4">No activity matches these filters.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Record Ref</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((a) => {
                const Icon = MODULE_ICON[a.module] ?? ScrollText;
                return (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs text-zinc-500 whitespace-nowrap">{a.occurred_at}</TableCell>
                    <TableCell className="text-xs">{a.user_name || (a.user_id ? `#${a.user_id}` : "system")}</TableCell>
                    <TableCell className="text-xs font-medium">{a.action}</TableCell>
                    <TableCell className="text-xs">
                      <span className="inline-flex items-center gap-1 text-zinc-500">
                        <Icon size={12} /> {a.module}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{a.record_ref}</TableCell>
                    <TableCell className="text-xs text-zinc-500 max-w-xs truncate">{a.details}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-zinc-500 tabular-nums">
          Page {page + 1} of {totalPages}
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
