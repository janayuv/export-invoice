import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "@/lib/toast";
import { FileText, RefreshCw, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { readAppLogTail } from "@/admin/services/adminApi";
import { userMessageFromError } from "@/lib/errors";

const LINE_LIMITS = [100, 250, 500, 1000];

export function LogViewer() {
  const [lines, setLines] = useState<string[]>([]);
  const [limit, setLimit] = useState(250);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    readAppLogTail(limit)
      .then(setLines)
      .catch((e) => toast.error(userMessageFromError(e)))
      .finally(() => setLoading(false));
  }, [limit]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="p-6 space-y-5 flex flex-col min-h-0 h-full">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-400/15">
            <FileText size={18} className="text-slate-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Application Log</h1>
            <p className="text-xs text-zinc-500">
              Tail of <code className="text-[11px]">logs/app.log</code> in app data.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/admin/system-health"
            className="inline-flex items-center justify-center gap-1 h-8 px-3 text-xs font-medium rounded-md border border-input bg-background hover:bg-accent"
          >
            <ArrowLeft size={14} />
            System Health
          </Link>
          <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LINE_LIMITS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  Last {n} lines
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-[320px] rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-950 overflow-auto">
        {loading && lines.length === 0 ? (
          <p className="p-4 text-xs text-zinc-500">Loading…</p>
        ) : lines.length === 0 ? (
          <p className="p-4 text-xs text-zinc-500">No log lines yet. Activity will appear after the app runs with file logging enabled.</p>
        ) : (
          <pre className="p-4 text-[11px] leading-relaxed font-mono text-zinc-300 whitespace-pre-wrap break-all">
            {lines.join("\n")}
          </pre>
        )}
      </div>
    </div>
  );
}
