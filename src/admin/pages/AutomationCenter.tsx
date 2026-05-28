import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Zap,
  Database,
  Activity,
  UserCheck,
  HeartPulse,
  ShieldCheck,
  Lock,
  Gauge,
  Bot,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAutomationTasks, type AutomationTask } from "@/admin/services/adminApi";

const NAV_CARDS = [
  { to: "/admin/database-management", label: "Database Management", icon: Database,    color: "text-blue-400",   bg: "bg-blue-400/10" },
  { to: "/admin/activity-log",        label: "Activity Log",        icon: Activity,    color: "text-indigo-400", bg: "bg-indigo-400/10" },
  { to: "/admin/user-activity",       label: "User Activity",       icon: UserCheck,   color: "text-teal-400",   bg: "bg-teal-400/10" },
  { to: "/admin/system-health",       label: "System Health",       icon: HeartPulse,  color: "text-green-400",  bg: "bg-green-400/10" },
  { to: "/admin/security-center",     label: "Security Center",     icon: ShieldCheck, color: "text-red-400",    bg: "bg-red-400/10" },
  { to: "/admin/roles-permissions",   label: "Roles & Permissions", icon: Lock,        color: "text-violet-400", bg: "bg-violet-400/10" },
  { to: "/admin/operations-center",   label: "Operations Center",   icon: Gauge,       color: "text-amber-400",  bg: "bg-amber-400/10" },
  { to: "/admin/system-agent",        label: "System Agent",        icon: Bot,         color: "text-pink-400",   bg: "bg-pink-400/10" },
] as const;

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  running:   "secondary",
  failed:    "destructive",
  pending:   "outline",
};

function stripErrPrefix(e: unknown): string {
  return String(e).replace(/^ERR_\w+:\s*/i, "");
}

export function AutomationCenter() {
  const [tasks, setTasks] = useState<AutomationTask[]>([]);

  useEffect(() => {
    getAutomationTasks(10)
      .then(setTasks)
      .catch((e) => toast.error(stripErrPrefix(e)));
  }, []);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-amber-400/15">
          <Zap size={18} className="text-amber-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Automation Center</h1>
          <p className="text-xs text-zinc-500">Hub for all admin operations and task history.</p>
        </div>
      </div>

      {/* Admin nav cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {NAV_CARDS.map(({ to, label, icon: Icon, color, bg }) => (
          <Link key={to} to={to}>
            <Card className="hover:ring-2 hover:ring-foreground/20 transition-all cursor-pointer h-full">
              <CardContent className="pt-4 pb-4 flex flex-col items-start gap-2">
                <div className={`w-8 h-8 rounded-md flex items-center justify-center ${bg}`}>
                  <Icon size={16} className={color} />
                </div>
                <p className="text-xs font-medium leading-snug">{label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Recent task history */}
      <div className="rounded-xl ring-1 ring-foreground/10 bg-card overflow-auto">
        <div className="px-4 py-3 border-b border-foreground/10">
          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            Recent Background Tasks
          </p>
        </div>
        {tasks.length === 0 ? (
          <p className="text-sm text-zinc-500 p-4">No tasks have run yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Ran At</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-xs font-mono">{t.task_name}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[t.status] ?? "outline"} className="text-xs">
                      {t.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{t.duration_ms}ms</TableCell>
                  <TableCell className="text-xs text-zinc-500 whitespace-nowrap">{t.ran_at}</TableCell>
                  <TableCell className="text-xs text-zinc-500 max-w-xs truncate">{t.details}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
