import { useCallback, useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import { Bot, Play, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
  getAgentSettings,
  updateAgentSettings,
  runAgentTask,
  getAutomationTasks,
  type AgentSettings,
  type AutomationTask,
} from "@/admin/services/adminApi";

const INTERVAL_OPTS = [
  { label: "5 minutes",  value: 300 },
  { label: "15 minutes", value: 900 },
  { label: "30 minutes", value: 1800 },
  { label: "1 hour",     value: 3600 },
] as const;

const TASK_BUTTONS = [
  { label: "Run Integrity Check", taskName: "integrity_check" },
  { label: "Auto Backup",         taskName: "backup" },
  { label: "Purge Old Logs",      taskName: "purge_activity_log" },
  { label: "Vacuum DB",           taskName: "vacuum" },
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

export function SystemAgent() {
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [intervalSec, setIntervalSec] = useState(300);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [tasks, setTasks] = useState<AutomationTask[]>([]);

  const loadTasks = useCallback(() => {
    getAutomationTasks(20)
      .then(setTasks)
      .catch((e) => toast.error(stripErrPrefix(e)));
  }, []);

  useEffect(() => {
    getAgentSettings()
      .then((s) => {
        setSettings(s);
        setEnabled(s.enabled);
        setIntervalSec(s.task_interval_sec);
      })
      .catch((e) => toast.error(stripErrPrefix(e)));
    loadTasks();
  }, [loadTasks]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateAgentSettings(enabled, intervalSec);
      toast.success("Agent settings saved.");
    } catch (e) {
      toast.error(stripErrPrefix(e));
    } finally {
      setSaving(false);
    }
  };

  const handleTask = async (taskName: string) => {
    setRunning(taskName);
    try {
      const result = await runAgentTask(taskName);
      toast.success(`${taskName} completed in ${result.duration_ms}ms.`);
      loadTasks();
    } catch (e) {
      toast.error(stripErrPrefix(e));
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-pink-400/15">
          <Bot size={18} className="text-pink-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">System Agent</h1>
          <p className="text-xs text-zinc-500">
            Background agent runs integrity checks on your interval; auto-backup at most once per
            day. Manual backup saves to AppData backups folder.
          </p>
        </div>
      </div>

      {/* Settings card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Agent Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Enable toggle */}
          <div className="flex items-center gap-3">
            <input
              id="agent-enabled"
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 accent-indigo-600 cursor-pointer"
            />
            <Label htmlFor="agent-enabled" className="text-sm cursor-pointer">
              Enable background agent
            </Label>
          </div>

          {/* Interval */}
          <div className="flex items-center gap-3">
            <Label className="text-sm text-zinc-500 w-16">Interval</Label>
            <Select
              value={String(intervalSec)}
              onValueChange={(v) => setIntervalSec(Number(v))}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTERVAL_OPTS.map((o) => (
                  <SelectItem key={o.value} value={String(o.value)}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {settings?.last_run_at && (
            <p className="text-xs text-zinc-500">Last run: {settings.last_run_at}</p>
          )}

          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save size={13} className="mr-1.5" />
            {saving ? "Saving…" : "Save Settings"}
          </Button>
        </CardContent>
      </Card>

      {/* Manual task runner */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Run Task Manually</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {TASK_BUTTONS.map(({ label, taskName }) => (
              <Button
                key={taskName}
                variant="outline"
                size="sm"
                disabled={running !== null}
                onClick={() => handleTask(taskName)}
              >
                <Play size={12} className="mr-1.5" />
                {running === taskName ? "Running…" : label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Task history */}
      <div className="rounded-xl ring-1 ring-foreground/10 bg-card overflow-auto max-h-[45vh]">
        <div className="px-4 py-3 border-b border-foreground/10">
          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            Task History (last 20)
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
                  <TableCell className="text-xs text-zinc-500 whitespace-nowrap">
                    {t.ran_at}
                  </TableCell>
                  <TableCell className="text-xs text-zinc-500 max-w-xs truncate">
                    {t.details}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
