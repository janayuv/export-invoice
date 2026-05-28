import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getAuthAuditLog,
  getAuthTelemetryWindow,
  getCurrentSession,
  type AuthAuditEntry,
  type AuthTelemetry,
  type CurrentSessionInfo,
} from "@/lib/auth";
import { getSecurityTrends, type SecurityTrendPoint } from "@/admin/services/adminApi";

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

function stripErrPrefix(e: unknown): string {
  return String(e).replace(/^ERR_\w+:\s*/i, "");
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="flex-1 min-w-[110px]">
      <CardContent className="pt-4 pb-3">
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
}

export function SecurityCenter() {
  const [telemetry, setTelemetry] = useState<AuthTelemetry | null>(null);
  const [authLog, setAuthLog] = useState<AuthAuditEntry[]>([]);
  const [trends, setTrends] = useState<SecurityTrendPoint[]>([]);
  const [currentSession, setCurrentSession] = useState<CurrentSessionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getAuthTelemetryWindow(24),
      getAuthAuditLog(100),
      getSecurityTrends(14),
      getCurrentSession(),
    ])
      .then(([t, log, tr, sess]) => {
        setTelemetry(t);
        setAuthLog(log);
        setTrends(tr);
        setCurrentSession(sess);
      })
      .catch((e) => toast.error(stripErrPrefix(e)))
      .finally(() => setLoading(false));
  }, []);

  // Unique users who appear in a 'locked' event
  const lockedUsers = authLog
    .filter((e) => e.event_type === "locked")
    .reduce<AuthAuditEntry[]>((acc, e) => {
      if (!acc.find((x) => x.user_id === e.user_id)) acc.push(e);
      return acc;
    }, []);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-red-400/15">
          <ShieldCheck size={18} className="text-red-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Security Center</h1>
          <p className="text-xs text-zinc-500">Auth events and 14-day security trends.</p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : (
        <>
          {/* Active session (single desktop login) */}
          {currentSession && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Active Session</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <p className="text-zinc-500">User</p>
                  <p className="font-medium">{currentSession.user_name}</p>
                </div>
                <div>
                  <p className="text-zinc-500">Role</p>
                  <p className="font-medium capitalize">{currentSession.role}</p>
                </div>
                <div>
                  <p className="text-zinc-500">Signed in</p>
                  <p className="font-medium">{currentSession.logged_in_at}</p>
                </div>
                <div>
                  <p className="text-zinc-500">Source</p>
                  <p className="font-medium">{currentSession.source}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Metrics strip */}
          {telemetry && (
            <div className="flex flex-wrap gap-3">
              <StatCard label="Failed (24h)"   value={telemetry.failed_attempts} />
              <StatCard label="Lockouts (24h)" value={telemetry.lock_events} />
              <StatCard label="Logins (24h)"   value={telemetry.login_successes} />
              <StatCard label="PIN Changes"    value={telemetry.pin_changes} />
              <StatCard label="Unlocks"        value={telemetry.unlock_events} />
            </div>
          )}

          {/* 14-day trend chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">14-Day Security Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trends} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line
                    type="monotone"
                    dataKey="failed_logins"
                    stroke="#ef4444"
                    name="Failed Logins"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="lockouts"
                    stroke="#f97316"
                    name="Lockouts"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="pin_changes"
                    stroke="#6366f1"
                    name="PIN Changes"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Auth event log */}
            <div className="rounded-xl ring-1 ring-foreground/10 bg-card overflow-auto max-h-[50vh]">
              <div className="px-4 py-3 border-b border-foreground/10">
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Recent Auth Events
                </p>
              </div>
              {authLog.length === 0 ? (
                <p className="text-sm text-zinc-500 p-4">No events.</p>
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
                    {authLog.map((e) => {
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

            {/* Recently locked accounts */}
            <div className="rounded-xl ring-1 ring-foreground/10 bg-card overflow-auto max-h-[50vh]">
              <div className="px-4 py-3 border-b border-foreground/10">
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Recently Locked Accounts
                </p>
              </div>
              {lockedUsers.length === 0 ? (
                <p className="text-sm text-zinc-500 p-4">No locked accounts.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User ID</TableHead>
                      <TableHead>Locked At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lockedUsers.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs">
                          {e.user_id ? `#${e.user_id}` : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-zinc-500">{e.occurred_at}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
