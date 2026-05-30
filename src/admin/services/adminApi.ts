import { invoke } from "@tauri-apps/api/core";

export interface TableStat {
  table_name: string;
  record_count: number;
}

export interface DbOverviewResult {
  tables: TableStat[];
  recent_activity: ActivityLogEntry[];
}

export interface ActivityLogEntry {
  id: number;
  user_id: number | null;
  user_name: string;
  action: string;
  module: string;
  record_ref: string;
  details: string;
  occurred_at: string;
}

export interface BrowseResult {
  columns: string[];
  rows: Record<string, string>[];
  total: number;
}

export interface SystemHealthMetrics {
  db_size_bytes: number;
  db_page_count: number;
  db_page_size: number;
  integrity_ok: boolean;
  last_backup_at: string | null;
  active_users: number;
  total_users: number;
  invoice_count: number;
  po_count: number;
  entry_count: number;
  migration_version: number;
}

export interface SecurityTrendPoint {
  date: string;
  failed_logins: number;
  lockouts: number;
  pin_changes: number;
}

export interface AutomationTask {
  id: number;
  task_name: string;
  status: "pending" | "running" | "completed" | "failed";
  duration_ms: number;
  ran_at: string;
  details: string;
}

export interface Incident {
  id: number;
  severity: "INFO" | "WARNING" | "CRITICAL" | "FATAL";
  status: "active" | "resolved" | "suppressed";
  description: string;
  resolution_notes: string;
  created_at: string;
  resolved_at: string | null;
}

export interface AgentSettings {
  enabled: boolean;
  task_interval_sec: number;
  last_run_at: string | null;
  notes: string;
}

// ── DB overview ───────────────────────────────────────────────────────────────

export function adminDbOverview(): Promise<DbOverviewResult> {
  return invoke("admin_db_overview");
}

export function adminBrowseTable(
  tableName: string,
  page: number,
  pageSize: number,
): Promise<BrowseResult> {
  return invoke("admin_browse_table", { tableName, page, pageSize });
}

// ── Activity log ──────────────────────────────────────────────────────────────

export function getActivityLog(
  limit: number,
  offset: number,
  userId?: number | null,
  search?: string | null,
): Promise<ActivityLogEntry[]> {
  return invoke("get_activity_log", { limit, offset, userId: userId ?? null, search: search ?? null });
}

export function getActivityLogCount(
  userId?: number | null,
  search?: string | null,
): Promise<number> {
  return invoke("get_activity_log_count", { userId: userId ?? null, search: search ?? null });
}

// ── System health ─────────────────────────────────────────────────────────────

export function getSystemHealth(): Promise<SystemHealthMetrics> {
  return invoke("get_system_health");
}

export function readAppLogTail(limit: number): Promise<string[]> {
  return invoke("read_app_log_tail", { limit });
}

// ── Security trends ───────────────────────────────────────────────────────────

export function getSecurityTrends(days: number): Promise<SecurityTrendPoint[]> {
  return invoke("get_security_trends", { days });
}

// ── Automation tasks ──────────────────────────────────────────────────────────

export function getAutomationTasks(limit: number): Promise<AutomationTask[]> {
  return invoke("get_automation_tasks", { limit });
}

// ── Incidents ─────────────────────────────────────────────────────────────────

export function getIncidents(): Promise<Incident[]> {
  return invoke("get_incidents");
}

export function createIncident(severity: string, description: string): Promise<void> {
  return invoke("create_incident", { severity, description });
}

export function resolveIncident(id: number, notes: string): Promise<void> {
  return invoke("resolve_incident", { id, notes });
}

// ── Agent settings ────────────────────────────────────────────────────────────

export function getAgentSettings(): Promise<AgentSettings> {
  return invoke("get_agent_settings");
}

export function updateAgentSettings(enabled: boolean, intervalSec: number): Promise<void> {
  return invoke("update_agent_settings", { enabled, intervalSec });
}

export function runAgentTask(taskName: string): Promise<AutomationTask> {
  return invoke("run_agent_task", { taskName });
}
