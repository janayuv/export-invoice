use std::collections::HashMap;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::state::{app_config_dir, AppDb, AuthSession};
use crate::rbac::require_admin_session;

// ── Canonical action name constants ──────────────────────────────────────────
// Use these everywhere: activity_log rows, frontend display, tests.
pub const ACT_CREATE_INVOICE: &str = "CREATE_INVOICE";
pub const ACT_UPDATE_INVOICE: &str = "UPDATE_INVOICE";
pub const ACT_DELETE_INVOICE: &str = "DELETE_INVOICE";
pub const ACT_FINALIZE_INVOICE: &str = "FINALIZE_INVOICE";
pub const ACT_CREATE_PO: &str = "CREATE_PO";
pub const ACT_UPDATE_PO: &str = "UPDATE_PO";
pub const ACT_DELETE_PO: &str = "DELETE_PO";
pub const ACT_SET_PO_STATUS: &str = "SET_PO_STATUS";
pub const ACT_CREATE_ENTRY: &str = "CREATE_ENTRY";
pub const ACT_UPDATE_ENTRY: &str = "UPDATE_ENTRY";
pub const ACT_DELETE_ENTRY: &str = "DELETE_ENTRY";

// Agent task names — snake_case, must match run_agent_task allowlist exactly.
pub const TASK_INTEGRITY_CHECK: &str = "integrity_check";
pub const TASK_BACKUP: &str = "backup";
pub const TASK_PURGE_ACTIVITY_LOG: &str = "purge_activity_log";
pub const TASK_VACUUM: &str = "vacuum";

// ── Shared response types ─────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct TableStat {
    pub table_name: String,
    pub record_count: i64,
}

#[derive(Debug, Serialize)]
pub struct ActivityLogEntry {
    pub id: i64,
    pub user_id: Option<i64>,
    pub user_name: String,
    pub action: String,
    pub module: String,
    pub record_ref: String,
    pub details: String,
    pub occurred_at: String,
}

#[derive(Debug, Serialize)]
pub struct BrowseResult {
    pub columns: Vec<String>,
    // All row values are coerced to String so the frontend has a stable shape.
    pub rows: Vec<serde_json::Value>,
    pub total: i64,
}

#[derive(Debug, Serialize)]
pub struct SystemHealthMetrics {
    pub db_size_bytes: i64,
    pub db_page_count: i64,
    pub db_page_size: i64,
    pub integrity_ok: bool,
    pub last_backup_at: Option<String>,
    pub active_users: i64,
    pub total_users: i64,
    pub invoice_count: i64,
    pub po_count: i64,
    pub entry_count: i64,
    pub migration_version: i64,
}

#[derive(Debug, Serialize)]
pub struct SecurityTrendPoint {
    pub date: String,
    pub failed_logins: i64,
    pub lockouts: i64,
    pub pin_changes: i64,
}

#[derive(Debug, Serialize)]
pub struct AutomationTask {
    pub id: i64,
    pub task_name: String,
    pub status: String,
    pub duration_ms: i64,
    pub ran_at: String,
    pub details: String,
}

#[derive(Debug, Serialize)]
pub struct Incident {
    pub id: i64,
    pub severity: String,
    pub status: String,
    pub description: String,
    pub resolution_notes: String,
    pub created_at: String,
    pub resolved_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentSettings {
    pub enabled: bool,
    pub task_interval_sec: i64,
    pub last_run_at: Option<String>,
    pub notes: String,
}

#[derive(Debug, Serialize)]
pub struct DbOverviewResult {
    pub tables: Vec<TableStat>,
    pub recent_activity: Vec<ActivityLogEntry>,
}

// ── Internal helpers ───────────────────────────────────────────────────────────

fn resolve_user_display_name(conn: &Connection, user_id: Option<i64>, fallback: &str) -> String {
    if !fallback.trim().is_empty() {
        return fallback.trim().to_string();
    }
    let Some(uid) = user_id else {
        return "system".to_string();
    };
    conn.query_row(
        "SELECT name FROM users WHERE id=?1",
        rusqlite::params![uid],
        |r| r.get::<_, String>(0),
    )
    .unwrap_or_else(|_| format!("#{uid}"))
}

/// Inserts a row into `automation_tasks` (used by backup + agent runner).
pub fn record_automation_task(
    conn: &Connection,
    task_name: &str,
    status: &str,
    duration_ms: i64,
    details: &str,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO automation_tasks (task_name, status, duration_ms, details)
         VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![task_name, status, duration_ms, details],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn logic_auto_backup(conn: &Connection) -> Result<String, String> {
    let dir = app_config_dir().ok_or("Cannot resolve app config directory")?;
    let backups = dir.join("backups");
    std::fs::create_dir_all(&backups).map_err(|e| e.to_string())?;
    let stamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let dest = backups.join(format!("auto_backup_{stamp}.db"));
    let dest_str = dest.to_string_lossy().to_string();
    conn.execute("VACUUM INTO ?1", rusqlite::params![dest_str])
        .map_err(|e| format!("Backup failed: {e}"))?;
    Ok(format!("Backup saved to {}", dest.display()))
}

/// Core task body — no session check; used by `run_agent_task` and the background scheduler.
fn execute_agent_task_body(conn: &Connection, task_name: &str) -> Result<String, String> {
    match task_name {
        TASK_INTEGRITY_CHECK => {
            let r: String = conn
                .query_row("PRAGMA integrity_check", [], |r| r.get(0))
                .unwrap_or_else(|e| e.to_string());
            if r.trim() == "ok" {
                Ok(r)
            } else {
                Err(r)
            }
        }
        TASK_PURGE_ACTIVITY_LOG => {
            let deleted = conn
                .execute(
                    "DELETE FROM activity_log WHERE occurred_at < datetime('now', '-90 days')",
                    [],
                )
                .map_err(|e| e.to_string())?;
            Ok(format!("Deleted {deleted} rows older than 90 days"))
        }
        TASK_VACUUM => {
            conn.execute_batch("VACUUM").map_err(|e| e.to_string())?;
            Ok("VACUUM complete".to_string())
        }
        TASK_BACKUP => logic_auto_backup(conn),
        _ => Err(format!("Unknown task: {task_name}")),
    }
}

fn insert_automation_task_row(
    conn: &Connection,
    task_name: &str,
    status: &str,
    duration_ms: i64,
    details: &str,
) -> Result<AutomationTask, String> {
    record_automation_task(conn, task_name, status, duration_ms, details)?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, task_name, status, duration_ms, ran_at, details
           FROM automation_tasks WHERE id=?1",
        rusqlite::params![id],
        |r| {
            Ok(AutomationTask {
                id: r.get(0)?,
                task_name: r.get(1)?,
                status: r.get(2)?,
                duration_ms: r.get(3)?,
                ran_at: r.get(4)?,
                details: r.get(5)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

/// Background scheduler tick — runs when agent is enabled and the interval has elapsed.
pub fn maybe_run_scheduled_agent(conn: &Connection) -> Result<(), String> {
    let (enabled, interval_sec, last_run_at): (bool, i64, Option<String>) = conn
        .query_row(
            "SELECT enabled, task_interval_sec, last_run_at FROM system_agent_settings WHERE id=1",
            [],
            |r| {
                Ok((
                    r.get::<_, i64>(0)? != 0,
                    r.get(1)?,
                    r.get(2)?,
                ))
            },
        )
        .map_err(|e| e.to_string())?;

    if !enabled {
        return Ok(());
    }

    let due = match last_run_at.as_deref() {
        None => true,
        Some(ts) => conn
            .query_row(
                "SELECT CASE WHEN datetime('now') >= datetime(?1, '+' || ?2 || ' seconds')
                 THEN 1 ELSE 0 END",
                rusqlite::params![ts, interval_sec],
                |r| r.get::<_, i64>(0),
            )
            .unwrap_or(1)
            == 1,
    };
    if !due {
        return Ok(());
    }

    let start = std::time::Instant::now();
    let integrity = execute_agent_task_body(conn, TASK_INTEGRITY_CHECK);
    let duration_ms = start.elapsed().as_millis() as i64;
    let (status, details) = match integrity {
        Ok(msg) => ("completed", msg),
        Err(msg) => ("failed", msg),
    };
    record_automation_task(conn, TASK_INTEGRITY_CHECK, status, duration_ms, &details)?;

    let backup_due = latest_task_time(conn, TASK_BACKUP)
        .map(|t| {
            conn.query_row(
                "SELECT CASE WHEN datetime('now') >= datetime(?1, '+1 day') THEN 1 ELSE 0 END",
                rusqlite::params![t],
                |r| r.get::<_, i64>(0),
            )
            .unwrap_or(1)
                == 1
        })
        .unwrap_or(true);

    if backup_due {
        let start = std::time::Instant::now();
        let backup = execute_agent_task_body(conn, TASK_BACKUP);
        let duration_ms = start.elapsed().as_millis() as i64;
        let (status, details) = match backup {
            Ok(msg) => ("completed", msg),
            Err(msg) => ("failed", msg),
        };
        record_automation_task(conn, TASK_BACKUP, status, duration_ms, &details)?;
    }

    conn.execute(
        "UPDATE system_agent_settings SET last_run_at=datetime('now') WHERE id=1",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Internal helper: activity logging ────────────────────────────────────────
// NOT a Tauri command. Called by invoice.rs, purchase_order.rs, entry.rs.
// Failure is logged to stderr but must never fail the calling operation.
pub fn log_activity(
    conn: &Connection,
    user_id: Option<i64>,
    user_name: &str,
    action: &str,     // use ACT_* constants above
    module: &str,     // "invoices" | "purchase_orders" | "entries"
    record_ref: &str, // e.g. "EXP/25/2025-26"
) {
    let display_name = resolve_user_display_name(conn, user_id, user_name);
    let result = conn.execute(
        "INSERT INTO activity_log (user_id, user_name, action, module, record_ref)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![user_id, display_name, action, module, record_ref],
    );
    if let Err(e) = result {
        eprintln!("[admin] activity log insert failed: {e}");
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Ensures Admin Center tables exist on the active DB (Rust connection path).
/// Called from the frontend at startup so admin pages work before any admin route loads.
#[tauri::command]
pub fn ensure_database_schema(db: State<AppDb>) -> Result<(), String> {
    db.with_conn(crate::db::schema::sync_pending_plugin_migrations)
}

// ── Role permissions ──────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct RolePermissionRow {
    pub role: String,
    pub permission: String,
    pub granted: bool,
}

#[derive(Debug, Deserialize)]
pub struct SetRolePermissionPayload {
    pub role: String,
    pub permission: String,
    pub granted: bool,
}

/// Returns every row in role_permissions for operator and viewer. Admin-only.
#[tauri::command]
pub fn get_role_permissions(
    db: State<'_, AppDb>,
    session: State<'_, AuthSession>,
) -> Result<Vec<RolePermissionRow>, String> {
    require_admin_session(&session)?;
    db.with_conn(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT role, permission, granted \
                 FROM role_permissions \
                 ORDER BY role, permission",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(RolePermissionRow {
                    role: r.get(0)?,
                    permission: r.get(1)?,
                    granted: r.get::<_, i64>(2)? != 0,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok(rows)
    })
}

/// Upserts a single role+permission grant. Role must be operator or viewer.
/// Admin-only. Permission key is stored as-is — no locked list enforced here.
#[tauri::command]
pub fn set_role_permission(
    db: State<'_, AppDb>,
    session: State<'_, AuthSession>,
    payload: SetRolePermissionPayload,
) -> Result<(), String> {
    let sess = require_admin_session(&session)?;
    if payload.role != "operator" && payload.role != "viewer" {
        return Err("ERR_VALIDATION: role must be operator or viewer".into());
    }
    db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO role_permissions (role, permission, granted, updated_at, updated_by)
             VALUES (?1, ?2, ?3, datetime('now'), ?4)
             ON CONFLICT(role, permission) DO UPDATE SET
                 granted    = excluded.granted,
                 updated_at = excluded.updated_at,
                 updated_by = excluded.updated_by",
            rusqlite::params![
                payload.role,
                payload.permission,
                payload.granted as i64,
                sess.user_id,
            ],
        )
        .map_err(|e| e.to_string())?;
        log_activity(
            conn,
            Some(sess.user_id),
            &sess.user_name,
            "SET_ROLE_PERMISSION",
            "role_permissions",
            &format!("{}:{} granted={}", payload.role, payload.permission, payload.granted),
        );
        Ok(())
    })
}

/// Returns record counts for all user tables + 5 most recent activity log entries.
#[tauri::command]
pub fn admin_db_overview(
    db: State<AppDb>,
    session: State<AuthSession>,
) -> Result<DbOverviewResult, String> {
    require_admin_session(&session)?;
    db.with_conn(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT name FROM sqlite_master
                  WHERE type='table'
                    AND name NOT LIKE 'sqlite_%'
                    AND name NOT LIKE '_sqlx_%'
                  ORDER BY name",
            )
            .map_err(|e| e.to_string())?;

        let table_names: Vec<String> = stmt
            .query_map([], |r| r.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        let mut tables = Vec::with_capacity(table_names.len());
        for name in &table_names {
            let count: i64 = conn
                .query_row(
                    &format!("SELECT COUNT(*) FROM \"{}\"", name.replace('"', "\"\"")),
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            tables.push(TableStat { table_name: name.clone(), record_count: count });
        }

        let mut astmt = conn
            .prepare(
                "SELECT id, user_id, user_name, action, module, record_ref, details, occurred_at
                   FROM activity_log
                  ORDER BY occurred_at DESC
                  LIMIT 5",
            )
            .map_err(|e| e.to_string())?;

        let recent_activity: Vec<ActivityLogEntry> = astmt
            .query_map([], |r| {
                Ok(ActivityLogEntry {
                    id: r.get(0)?,
                    user_id: r.get(1)?,
                    user_name: r.get(2)?,
                    action: r.get(3)?,
                    module: r.get(4)?,
                    record_ref: r.get(5)?,
                    details: r.get(6)?,
                    occurred_at: r.get(7)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        Ok(DbOverviewResult { tables, recent_activity })
    })
}

/// Browse a table with pagination. Table name is validated against sqlite_master.
/// All row values are coerced to String; nulls become empty string.
#[tauri::command]
pub fn admin_browse_table(
    db: State<AppDb>,
    session: State<AuthSession>,
    table_name: String,
    page: i64,
    page_size: i64,
) -> Result<BrowseResult, String> {
    require_admin_session(&session)?;
    let page_size = page_size.clamp(1, 200);
    let offset = page.max(0) * page_size;

    db.with_conn(|conn| {
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
                rusqlite::params![&table_name],
                |r| r.get::<_, i64>(0),
            )
            .map(|c| c > 0)
            .map_err(|e| e.to_string())?;

        if !exists {
            return Err(format!("Unknown table: {table_name}"));
        }

        // table_name is already confirmed to exist in sqlite_master above; the
        // identifier quoting here is defensive belt-and-suspenders. Escape once.
        let quoted = table_name.replace('"', "\"\"");

        let total: i64 = conn
            .query_row(
                &format!("SELECT COUNT(*) FROM \"{quoted}\""),
                [],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;

        let sql = format!("SELECT * FROM \"{quoted}\" LIMIT ?1 OFFSET ?2");
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let col_count = stmt.column_count();
        let columns: Vec<String> = (0..col_count)
            .map(|i| stmt.column_name(i).unwrap_or("?").to_string())
            .collect();

        let rows: Vec<serde_json::Value> = stmt
            .query_map(rusqlite::params![page_size, offset], |r| {
                let mut obj = serde_json::Map::new();
                for i in 0..col_count {
                    let val = match r.get_ref(i) {
                        Ok(rusqlite::types::ValueRef::Null) => String::new(),
                        Ok(rusqlite::types::ValueRef::Integer(n)) => n.to_string(),
                        Ok(rusqlite::types::ValueRef::Real(f)) => f.to_string(),
                        Ok(rusqlite::types::ValueRef::Text(s)) => {
                            String::from_utf8_lossy(s).to_string()
                        }
                        Ok(rusqlite::types::ValueRef::Blob(_)) => "[blob]".to_string(),
                        Err(_) => String::new(),
                    };
                    let key = r.as_ref().column_name(i).unwrap_or("?").to_string();
                    obj.insert(key, serde_json::Value::String(val));
                }
                Ok(serde_json::Value::Object(obj))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        Ok(BrowseResult { columns, rows, total })
    })
}

/// Paginated activity log with optional user and text filters.
#[tauri::command]
pub fn get_activity_log(
    db: State<AppDb>,
    session: State<AuthSession>,
    limit: i64,
    offset: i64,
    user_id: Option<i64>,
    search: Option<String>,
) -> Result<Vec<ActivityLogEntry>, String> {
    require_admin_session(&session)?;
    db.with_conn(|conn| {
        let search_pat = search.as_deref().map(|s| format!("%{s}%"));
        let mut stmt = conn
            .prepare(
                "SELECT id, user_id, user_name, action, module, record_ref, details, occurred_at
                   FROM activity_log
                  WHERE (?1 IS NULL OR user_id = ?1)
                    AND (?2 IS NULL OR action LIKE ?2 OR module LIKE ?2
                         OR record_ref LIKE ?2 OR details LIKE ?2)
                  ORDER BY occurred_at DESC
                  LIMIT ?3 OFFSET ?4",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(
                rusqlite::params![user_id, search_pat, limit.clamp(1, 500), offset.max(0)],
                |r| {
                    Ok(ActivityLogEntry {
                        id: r.get(0)?,
                        user_id: r.get(1)?,
                        user_name: r.get(2)?,
                        action: r.get(3)?,
                        module: r.get(4)?,
                        record_ref: r.get(5)?,
                        details: r.get(6)?,
                        occurred_at: r.get(7)?,
                    })
                },
            )
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        Ok(rows)
    })
}

/// Total activity log row count matching optional filters (for pagination UI).
#[tauri::command]
pub fn get_activity_log_count(
    db: State<AppDb>,
    session: State<AuthSession>,
    user_id: Option<i64>,
    search: Option<String>,
) -> Result<i64, String> {
    require_admin_session(&session)?;
    db.with_conn(|conn| {
        let search_pat = search.as_deref().map(|s| format!("%{s}%"));
        conn.query_row(
            "SELECT COUNT(*) FROM activity_log
              WHERE (?1 IS NULL OR user_id = ?1)
                AND (?2 IS NULL OR action LIKE ?2 OR module LIKE ?2
                     OR record_ref LIKE ?2 OR details LIKE ?2)",
            rusqlite::params![user_id, search_pat],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())
    })
}

/// Comprehensive system health snapshot (runs PRAGMA queries + table counts).
#[tauri::command]
pub fn get_system_health(
    db: State<AppDb>,
    session: State<AuthSession>,
) -> Result<SystemHealthMetrics, String> {
    require_admin_session(&session)?;
    db.with_conn(|conn| {
        let page_count: i64 =
            conn.query_row("PRAGMA page_count", [], |r| r.get(0)).map_err(|e| e.to_string())?;
        let page_size: i64 =
            conn.query_row("PRAGMA page_size", [], |r| r.get(0)).map_err(|e| e.to_string())?;

        let integrity_result: String = conn
            .query_row("PRAGMA integrity_check", [], |r| r.get(0))
            .unwrap_or_else(|_| "error".to_string());
        let integrity_ok = integrity_result.trim() == "ok";

        let migration_version: i64 =
            conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap_or(0);

        let count = |sql: &str| -> i64 {
            conn.query_row(sql, [], |r| r.get(0)).unwrap_or(0)
        };

        Ok(SystemHealthMetrics {
            db_size_bytes: page_count * page_size,
            db_page_count: page_count,
            db_page_size: page_size,
            integrity_ok,
            last_backup_at: latest_task_time(conn, TASK_BACKUP),
            active_users: count("SELECT COUNT(*) FROM users WHERE is_active=1"),
            total_users: count("SELECT COUNT(*) FROM users"),
            invoice_count: count("SELECT COUNT(*) FROM invoices"),
            po_count: count("SELECT COUNT(*) FROM purchase_orders"),
            entry_count: count("SELECT COUNT(*) FROM entries"),
            migration_version,
        })
    })
}

fn latest_task_time(conn: &Connection, task: &str) -> Option<String> {
    conn.query_row(
        "SELECT ran_at FROM automation_tasks
          WHERE task_name=?1 AND status='completed'
          ORDER BY ran_at DESC LIMIT 1",
        rusqlite::params![task],
        |r| r.get(0),
    )
    .ok()
}

/// Last N lines from the application log file (`logs/app.log` under app config).
#[tauri::command]
pub fn read_app_log_tail(
    session: State<AuthSession>,
    limit: i64,
) -> Result<Vec<String>, String> {
    require_admin_session(&session)?;
    let limit = limit.clamp(1, 2000) as usize;
    crate::logging::tail_log_lines(limit)
}

/// Per-day security event counts for the last N days (from auth_audit_log).
#[tauri::command]
pub fn get_security_trends(
    db: State<AppDb>,
    session: State<AuthSession>,
    days: i64,
) -> Result<Vec<SecurityTrendPoint>, String> {
    require_admin_session(&session)?;
    db.with_conn(|conn| {
        let days = days.clamp(1, 365);
        let modifier = format!("-{days} days");
        let mut stmt = conn
            .prepare(
                "SELECT
                   date(occurred_at) as day,
                   SUM(CASE WHEN event_type='failed_attempt' THEN 1 ELSE 0 END),
                   SUM(CASE WHEN event_type='locked'         THEN 1 ELSE 0 END),
                   SUM(CASE WHEN event_type='pin_changed'    THEN 1 ELSE 0 END)
                 FROM auth_audit_log
                 WHERE occurred_at >= datetime('now', ?1)
                 GROUP BY day
                 ORDER BY day ASC",
            )
            .map_err(|e| e.to_string())?;

        let rows: Vec<SecurityTrendPoint> = stmt
            .query_map(rusqlite::params![modifier], |r| {
                Ok(SecurityTrendPoint {
                    date: r.get(0)?,
                    failed_logins: r.get(1)?,
                    lockouts: r.get(2)?,
                    pin_changes: r.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        let mut by_day: HashMap<String, SecurityTrendPoint> =
            rows.into_iter().map(|p| (p.date.clone(), p)).collect();

        let today = chrono::Local::now().date_naive();
        let mut filled = Vec::with_capacity(days as usize);
        for offset in 0..days {
            let day = today - chrono::Duration::days(days - 1 - offset);
            let key = day.format("%Y-%m-%d").to_string();
            filled.push(
                by_day
                    .remove(&key)
                    .unwrap_or(SecurityTrendPoint {
                        date: key,
                        failed_logins: 0,
                        lockouts: 0,
                        pin_changes: 0,
                    }),
            );
        }

        Ok(filled)
    })
}

/// Last N automation task run records.
#[tauri::command]
pub fn get_automation_tasks(
    db: State<AppDb>,
    session: State<AuthSession>,
    limit: i64,
) -> Result<Vec<AutomationTask>, String> {
    require_admin_session(&session)?;
    db.with_conn(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT id, task_name, status, duration_ms, ran_at, details
                   FROM automation_tasks
                  ORDER BY ran_at DESC
                  LIMIT ?1",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(rusqlite::params![limit.clamp(1, 200)], |r| {
                Ok(AutomationTask {
                    id: r.get(0)?,
                    task_name: r.get(1)?,
                    status: r.get(2)?,
                    duration_ms: r.get(3)?,
                    ran_at: r.get(4)?,
                    details: r.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        Ok(rows)
    })
}

/// All incidents, newest first.
#[tauri::command]
pub fn get_incidents(
    db: State<AppDb>,
    session: State<AuthSession>,
) -> Result<Vec<Incident>, String> {
    require_admin_session(&session)?;
    db.with_conn(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT id, severity, status, description, resolution_notes, created_at, resolved_at
                   FROM incidents
                  ORDER BY created_at DESC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |r| {
                Ok(Incident {
                    id: r.get(0)?,
                    severity: r.get(1)?,
                    status: r.get(2)?,
                    description: r.get(3)?,
                    resolution_notes: r.get(4)?,
                    created_at: r.get(5)?,
                    resolved_at: r.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        Ok(rows)
    })
}

/// Creates a new incident. Severity must be INFO | WARNING | CRITICAL | FATAL.
#[tauri::command]
pub fn create_incident(
    db: State<AppDb>,
    session: State<AuthSession>,
    severity: String,
    description: String,
) -> Result<(), String> {
    require_admin_session(&session)?;
    let valid = ["INFO", "WARNING", "CRITICAL", "FATAL"];
    if !valid.contains(&severity.as_str()) {
        return Err(format!("Invalid severity: {severity}"));
    }
    if description.trim().is_empty() {
        return Err("Description cannot be empty".to_string());
    }
    db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO incidents (severity, description) VALUES (?1, ?2)",
            rusqlite::params![severity, description.trim()],
        )
        .map(|_| ())
        .map_err(|e| e.to_string())
    })
}

/// Marks an incident as resolved. Only active incidents can be resolved.
#[tauri::command]
pub fn resolve_incident(
    db: State<AppDb>,
    session: State<AuthSession>,
    id: i64,
    notes: String,
) -> Result<(), String> {
    require_admin_session(&session)?;
    db.with_conn(|conn| {
        let updated = conn
            .execute(
                "UPDATE incidents
                    SET status='resolved',
                        resolved_at=datetime('now'),
                        resolution_notes=?1
                  WHERE id=?2 AND status='active'",
                rusqlite::params![notes.trim(), id],
            )
            .map_err(|e| e.to_string())?;
        if updated == 0 {
            return Err(format!("Incident {id} not found or already resolved"));
        }
        Ok(())
    })
}

/// Returns the system agent settings (row id=1 is always present via migration seed).
#[tauri::command]
pub fn get_agent_settings(
    db: State<AppDb>,
    session: State<AuthSession>,
) -> Result<AgentSettings, String> {
    require_admin_session(&session)?;
    db.with_conn(|conn| {
        conn.query_row(
            "SELECT enabled, task_interval_sec, last_run_at, notes
               FROM system_agent_settings WHERE id=1",
            [],
            |r| {
                Ok(AgentSettings {
                    enabled: r.get::<_, bool>(0).unwrap_or(false),
                    task_interval_sec: r.get(1)?,
                    last_run_at: r.get(2)?,
                    notes: r.get(3)?,
                })
            },
        )
        .map_err(|e| e.to_string())
    })
}

/// Saves system agent enabled flag and interval.
#[tauri::command]
pub fn update_agent_settings(
    db: State<AppDb>,
    session: State<AuthSession>,
    enabled: bool,
    interval_sec: i64,
) -> Result<(), String> {
    require_admin_session(&session)?;
    let interval_sec = interval_sec.clamp(60, 86400);
    db.with_conn(|conn| {
        conn.execute(
            "UPDATE system_agent_settings SET enabled=?1, task_interval_sec=?2 WHERE id=1",
            rusqlite::params![enabled, interval_sec],
        )
        .map(|_| ())
        .map_err(|e| e.to_string())
    })
}

/// Runs a named admin task and records the result in automation_tasks.
/// Allowlist: integrity_check | backup | purge_activity_log | vacuum
#[tauri::command]
pub fn run_agent_task(
    db: State<AppDb>,
    session: State<AuthSession>,
    task_name: String,
) -> Result<AutomationTask, String> {
    require_admin_session(&session)?;

    let allowed = [TASK_INTEGRITY_CHECK, TASK_BACKUP, TASK_PURGE_ACTIVITY_LOG, TASK_VACUUM];
    if !allowed.contains(&task_name.as_str()) {
        return Err(format!("Unknown task: {task_name}"));
    }

    db.with_conn(|conn| {
        let start = std::time::Instant::now();
        let task_result = execute_agent_task_body(conn, &task_name);
        let duration_ms = start.elapsed().as_millis() as i64;
        let (status, details) = match task_result {
            Ok(msg) => ("completed", msg),
            Err(msg) => ("failed", msg),
        };
        insert_automation_task_row(conn, &task_name, status, duration_ms, &details)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::state::AuthSession;

    #[test]
    fn require_admin_denies_operator_for_admin_commands() {
        let session = AuthSession::new();
        session.set(2, "operator", "Op", vec![]).unwrap();
        let err = require_admin_session(&session).unwrap_err();
        assert!(err.contains("ERR_PERMISSION"));
    }
}
