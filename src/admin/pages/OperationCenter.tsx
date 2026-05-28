import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Gauge, Database, Users, FileText, Plus, CheckCheck, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
  getSystemHealth,
  getIncidents,
  createIncident,
  resolveIncident,
  type SystemHealthMetrics,
  type Incident,
} from "@/admin/services/adminApi";

const SEVERITY_OPTS = ["INFO", "WARNING", "CRITICAL", "FATAL"] as const;

const SEVERITY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  INFO:     "secondary",
  WARNING:  "outline",
  CRITICAL: "destructive",
  FATAL:    "destructive",
};

function stripErrPrefix(e: unknown): string {
  return String(e).replace(/^ERR_\w+:\s*/i, "");
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function OperationCenter() {
  const [health, setHealth] = useState<SystemHealthMetrics | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [severity, setSeverity] = useState<string>("WARNING");
  const [desc, setDesc] = useState("");
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  const loadIncidents = useCallback(() => {
    getIncidents()
      .then(setIncidents)
      .catch((e) => toast.error(stripErrPrefix(e)));
  }, []);

  useEffect(() => {
    getSystemHealth()
      .then(setHealth)
      .catch((e) => toast.error(stripErrPrefix(e)));
    loadIncidents();
  }, [loadIncidents]);

  const handleLog = async () => {
    if (!desc.trim()) {
      toast.error("Description is required.");
      return;
    }
    setSaving(true);
    try {
      await createIncident(severity, desc.trim());
      toast.success("Incident logged.");
      setDesc("");
      loadIncidents();
    } catch (e) {
      toast.error(stripErrPrefix(e));
    } finally {
      setSaving(false);
    }
  };

  const handleResolve = async (id: number) => {
    try {
      await resolveIncident(id, resolutionNotes[id] ?? "");
      toast.success("Incident resolved.");
      setResolvingId(null);
      setResolutionNotes((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      loadIncidents();
    } catch (e) {
      toast.error(stripErrPrefix(e));
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-amber-400/15">
          <Gauge size={18} className="text-amber-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Operations Center</h1>
          <p className="text-xs text-zinc-500">System metrics and incident tracking.</p>
        </div>
      </div>

      {/* System metrics strip */}
      {health && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3">
              <Database size={14} className="text-blue-400 mb-1" />
              <p className="text-xl font-bold">{fmtBytes(health.db_size_bytes)}</p>
              <p className="text-xs text-zinc-500">DB Size</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <Clock size={14} className="text-amber-400 mb-1" />
              <p className="text-sm font-bold leading-tight">
                {health.last_backup_at ?? "Never"}
              </p>
              <p className="text-xs text-zinc-500">Last Backup</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <Users size={14} className="text-teal-400 mb-1" />
              <p className="text-xl font-bold">{health.active_users}/{health.total_users}</p>
              <p className="text-xs text-zinc-500">Active / Total Users</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <FileText size={14} className="text-indigo-400 mb-1" />
              <p className="text-xl font-bold">{health.invoice_count}</p>
              <p className="text-xs text-zinc-500">Invoices</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <FileText size={14} className="text-violet-400 mb-1" />
              <p className="text-xl font-bold">{health.po_count}</p>
              <p className="text-xs text-zinc-500">Purchase Orders</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Log incident form */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Plus size={14} />
            Log Incident
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={severity} onValueChange={(v) => setSeverity(v ?? "WARNING")}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEVERITY_OPTS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Describe the incident…"
              className="flex-1 min-h-[60px] text-sm"
            />
          </div>
          <Button size="sm" onClick={handleLog} disabled={saving}>
            {saving ? "Logging…" : "Log Incident"}
          </Button>
        </CardContent>
      </Card>

      {/* Incidents table */}
      <div className="rounded-xl ring-1 ring-foreground/10 bg-card overflow-auto">
        <div className="px-4 py-3 border-b border-foreground/10">
          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Incidents</p>
        </div>
        {incidents.length === 0 ? (
          <p className="text-sm text-zinc-500 p-4">No incidents logged.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Created</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {incidents.flatMap((inc) => {
                const rows = [
                  <TableRow key={inc.id}>
                    <TableCell>
                      <Badge variant={SEVERITY_VARIANT[inc.severity] ?? "outline"} className="text-xs">
                        {inc.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={inc.status === "active" ? "destructive" : "secondary"}
                        className="text-xs"
                      >
                        {inc.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs max-w-xs">{inc.description}</TableCell>
                    <TableCell className="text-xs text-zinc-500 whitespace-nowrap">
                      {inc.created_at}
                    </TableCell>
                    <TableCell>
                      {inc.status === "active" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7"
                          onClick={() =>
                            setResolvingId(resolvingId === inc.id ? null : inc.id)
                          }
                        >
                          <CheckCheck size={12} className="mr-1" />
                          Resolve
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>,
                ];
                if (resolvingId === inc.id) {
                  rows.push(
                    <TableRow key={`resolve-${inc.id}`}>
                      <TableCell colSpan={5} className="bg-muted/40 py-2 px-4">
                        <div className="flex gap-2 items-start">
                          <Textarea
                            placeholder="Resolution notes (optional)…"
                            className="flex-1 text-xs min-h-[48px]"
                            value={resolutionNotes[inc.id] ?? ""}
                            onChange={(e) =>
                              setResolutionNotes((prev) => ({
                                ...prev,
                                [inc.id]: e.target.value,
                              }))
                            }
                          />
                          <Button size="sm" onClick={() => handleResolve(inc.id)}>
                            Confirm
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }
                return rows;
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
