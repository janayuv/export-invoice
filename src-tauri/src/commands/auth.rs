use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rand_core::OsRng;
use rusqlite::{Connection, OptionalExtension};
use sha2::{Digest, Sha256};
use tauri::State;

use crate::db::state::{AppDb, AuthSession};
use crate::rbac::require_admin_session;

// ── hashing helpers ───────────────────────────────────────────────────────────

/// SHA-256 hex digest — used only to verify legacy hashes stored before Argon2id
/// migration. Not constant-time on its own, but it's immediately replaced on
/// successful match so timing differences do not persist.
fn sha256_hex(input: &str) -> String {
    let mut h = Sha256::new();
    h.update(input.as_bytes());
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

fn hash_argon2(pin: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(pin.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| e.to_string())
}

fn verify_argon2(pin: &str, hash: &str) -> bool {
    let Ok(parsed) = PasswordHash::new(hash) else {
        return false;
    };
    Argon2::default()
        .verify_password(pin.as_bytes(), &parsed)
        .is_ok()
}

const MAX_ATTEMPTS: i64 = 5;
const LOCKOUT_MINUTES: i64 = 15;

/// Enforces PIN format: 4–6 ASCII digits. Called by both create and change paths.
fn validate_pin(pin: &str) -> Result<(), String> {
    if pin.len() < 4 || pin.len() > 6 {
        return Err("PIN must be 4–6 digits".into());
    }
    if !pin.chars().all(|c| c.is_ascii_digit()) {
        return Err("PIN must contain digits only".into());
    }
    Ok(())
}

// ── audit logging ─────────────────────────────────────────────────────────────

fn compute_chain_entry_hash(
    prev_hash: &str,
    event_type: &str,
    user_id: Option<i64>,
    occurred_at: &str,
    details_json: &str,
) -> String {
    let uid = user_id.map(|id| id.to_string()).unwrap_or_default();
    let canonical = format!("{prev_hash}|{event_type}|{uid}|{occurred_at}|{details_json}");
    let mut h = Sha256::new();
    h.update(canonical.as_bytes());
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

fn log_auth_event(conn: &Connection, user_id: Option<i64>, event_type: &str, details_json: &str) {
    // Capture timestamp explicitly so the same value goes into the INSERT and the hash payload.
    let occurred_at: String = conn
        .query_row("SELECT strftime('%Y-%m-%dT%H:%M:%SZ','now')", [], |r| r.get(0))
        .unwrap_or_default();

    // Fetch the most recent entry_hash for chain linking ('' when table is empty).
    let prev_hash: String = conn
        .query_row(
            "SELECT COALESCE(entry_hash,'') FROM auth_audit_log ORDER BY id DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or_default();

    let entry_hash = compute_chain_entry_hash(&prev_hash, event_type, user_id, &occurred_at, details_json);

    // Best-effort: a failing audit write must never block authentication.
    // IMPORTANT: callers must pass details_json as a fixed-format string literal (e.g.
    // `r#"{"remaining_attempts":4}"#`), never as serde_json::to_string output whose
    // key order could vary. Hash drift across semantically identical payloads breaks
    // chain verification even without actual tampering.
    let _ = conn.execute(
        "INSERT INTO auth_audit_log \
         (user_id, event_type, details_json, occurred_at, prev_hash, entry_hash) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![user_id, event_type, details_json, occurred_at, prev_hash, entry_hash],
    );
}

// ── security event logging ────────────────────────────────────────────────────

/// Log a permission-denied event for admin security diagnostics.
/// Best-effort — errors are silently dropped so they never block the command path.
pub(crate) fn log_security_event(
    conn: &Connection,
    command: &str,
    user_id: Option<i64>,
    reason: &str,
) {
    let _ = conn.execute(
        "INSERT INTO security_event_log (command, user_id, reason) VALUES (?1, ?2, ?3)",
        rusqlite::params![command, user_id, reason],
    );
}

// ── serializable user record ──────────────────────────────────────────────────

#[derive(Debug, serde::Serialize)]
pub struct UserRecord {
    pub id: i64,
    pub name: String,
    pub role: String,
    pub is_active: i64,
    pub created_at: String,
    pub permissions: Vec<String>,
}

#[derive(Debug, serde::Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum VerifyPinResult {
    Success { user: UserRecord },
    Failed { remaining_attempts: i64 },
    Locked { until: String },
}

// ── logic functions (take &Connection, directly testable) ────────────────────

pub fn logic_verify_pin(
    conn: &Connection,
    user_id: i64,
    pin: &str,
) -> Result<VerifyPinResult, String> {
    // Query including lockout columns (added in migration 23).
    let row_opt = conn
        .query_row(
            "SELECT id, name, pin_hash, role, is_active, created_at, \
                    failed_attempts, locked_until \
             FROM users WHERE id=?1 AND is_active=1",
            [user_id],
            |row| {
                Ok((
                    row.get::<_, String>(2)?,              // pin_hash
                    row.get::<_, i64>(6)?,                 // failed_attempts
                    row.get::<_, Option<String>>(7)?,      // locked_until
                    UserRecord {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        role: row.get(3)?,
                        is_active: row.get(4)?,
                        created_at: row.get(5)?,
                        permissions: vec![],  // populated by verify_pin after load_role_permissions
                    },
                ))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    // Unknown user: return Failed without leaking that the user doesn't exist.
    let Some((stored_hash, failed_attempts, locked_until, user)) = row_opt else {
        log_auth_event(conn, None, "failed_attempt", r#"{"remaining_attempts":5}"#);
        return Ok(VerifyPinResult::Failed { remaining_attempts: MAX_ATTEMPTS });
    };

    // Check active lockout — fail-secure if lockout state cannot be verified.
    if let Some(ref until) = locked_until {
        let still_locked: Result<bool, rusqlite::Error> = conn.query_row(
            "SELECT datetime(?1) > datetime('now')",
            [until.as_str()],
            |r| r.get(0),
        );
        match still_locked {
            Ok(true) => {
                log_auth_event(
                    conn,
                    Some(user_id),
                    "locked",
                    &format!(r#"{{"until":"{until}","reason":"active_lockout"}}"#),
                );
                return Ok(VerifyPinResult::Locked {
                    until: until.clone(),
                });
            }
            Ok(false) => {
                let _ = conn.execute(
                    "UPDATE users SET failed_attempts=0, locked_until=NULL WHERE id=?1",
                    [user_id],
                );
            }
            Err(_) => {
                log_auth_event(
                    conn,
                    Some(user_id),
                    "locked",
                    r#"{"reason":"fail_secure_ambiguous_lockout"}"#,
                );
                return Ok(VerifyPinResult::Locked {
                    until: until.clone(),
                });
            }
        }
    }

    // Distinguish legacy SHA-256 (64 lowercase hex chars) from Argon2id PHC strings.
    let is_sha256 = stored_hash.len() == 64
        && stored_hash.chars().all(|c| c.is_ascii_hexdigit());

    let matched = if is_sha256 {
        sha256_hex(pin) == stored_hash
    } else {
        verify_argon2(pin, &stored_hash)
    };

    if !matched {
        // Increment counter and potentially lock.
        conn.execute(
            "UPDATE users SET failed_attempts = failed_attempts + 1 WHERE id=?1",
            [user_id],
        )
        .map_err(|e| e.to_string())?;

        let new_count: i64 = conn
            .query_row(
                "SELECT failed_attempts FROM users WHERE id=?1",
                [user_id],
                |r| r.get(0),
            )
            .unwrap_or(failed_attempts + 1);

        if new_count >= MAX_ATTEMPTS {
            let lockout_expr = format!("+{LOCKOUT_MINUTES} minutes");
            // Emit ISO 8601 with explicit UTC marker so the frontend can parse
            // it unambiguously with new Date("...Z").
            let until: String = conn
                .query_row(
                    "SELECT strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?1)",
                    [lockout_expr.as_str()],
                    |r| r.get(0),
                )
                .map_err(|e| e.to_string())?;
            conn.execute(
                "UPDATE users SET locked_until=?1 WHERE id=?2",
                rusqlite::params![until, user_id],
            )
            .map_err(|e| e.to_string())?;
            log_auth_event(conn, Some(user_id), "locked",
                &format!(r#"{{"until":"{until}","lockout_minutes":{LOCKOUT_MINUTES}}}"#));
            return Ok(VerifyPinResult::Locked { until });
        }

        let remaining = MAX_ATTEMPTS - new_count;
        log_auth_event(conn, Some(user_id), "failed_attempt",
            &format!(r#"{{"remaining_attempts":{remaining}}}"#));
        return Ok(VerifyPinResult::Failed { remaining_attempts: remaining });
    }

    // Successful login: reset lockout state.
    conn.execute(
        "UPDATE users SET failed_attempts=0, locked_until=NULL WHERE id=?1",
        [user_id],
    )
    .map_err(|e| e.to_string())?;

    if failed_attempts > 0 {
        log_auth_event(conn, Some(user_id), "unlocked",
            &format!(r#"{{"prior_attempts":{failed_attempts}}}"#));
    }
    log_auth_event(conn, Some(user_id), "login_success", "{}");

    // Silently upgrade SHA-256 → Argon2id on first successful login with the old hash.
    if is_sha256 {
        if let Ok(new_hash) = hash_argon2(pin) {
            let _ = conn.execute(
                "UPDATE users SET pin_hash=?1, updated_at=datetime('now') WHERE id=?2",
                rusqlite::params![new_hash, user_id],
            );
        }
    }

    Ok(VerifyPinResult::Success { user })
}

pub fn logic_create_user(
    conn: &Connection,
    name: &str,
    pin: &str,
    role: &str,
) -> Result<(), String> {
    validate_pin(pin)?;
    let hash = hash_argon2(pin)?;
    conn.execute(
        "INSERT INTO users (name, pin_hash, role) VALUES (?1, ?2, ?3)",
        rusqlite::params![name.trim(), hash, role],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn logic_change_pin(conn: &Connection, user_id: i64, new_pin: &str) -> Result<(), String> {
    validate_pin(new_pin)?;
    let hash = hash_argon2(new_pin)?;
    conn.execute(
        "UPDATE users SET pin_hash=?1, updated_at=datetime('now') WHERE id=?2",
        rusqlite::params![hash, user_id],
    )
    .map_err(|e| e.to_string())?;
    log_auth_event(conn, Some(user_id), "pin_changed", "{}");
    Ok(())
}

pub fn logic_update_user_info(
    conn: &Connection,
    id: i64,
    name: &str,
    role: &str,
    is_active: bool,
    acting_role: &str,
    permissions: &[String],
) -> Result<(), String> {
    if acting_role != "admin" && !permissions.iter().any(|p| p == "manage_users") {
        return Err("ERR_PERMISSION: manage_users not granted".into());
    }
    conn.execute(
        "UPDATE users SET name=?1, role=?2, is_active=?3, updated_at=datetime('now') WHERE id=?4",
        rusqlite::params![name.trim(), role, is_active as i64, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Loads the effective permission set for a role from `role_permissions`.
/// Admin always gets the full static set; operator/viewer are read from the DB.
/// Falls back to empty if the table doesn't exist yet (first-launch migration lag).
pub fn load_role_permissions(conn: &Connection, role: &str) -> Vec<String> {
    if role == "admin" {
        return vec![
            "view_invoices".into(),
            "export_invoice".into(),
            "create_invoice".into(),
            "edit_invoice".into(),
            "edit_final_invoice".into(),
            "edit_confirmed_po".into(),
            "finalize_invoice".into(),
            "delete_invoice".into(),
            "access_settings".into(),
            "manage_users".into(),
            "view_database_mgmt".into(),
            "view_activity_log".into(),
            "view_user_activity".into(),
            "view_system_health".into(),
            "view_security_center".into(),
            "view_roles_permissions".into(),
            "view_automation".into(),
            "view_operations".into(),
            "view_system_agent".into(),
        ];
    }

    let result = conn.prepare(
        "SELECT permission FROM role_permissions WHERE role=?1 AND granted=1",
    );
    match result {
        Ok(mut stmt) => stmt
            .query_map([role], |r| r.get::<_, String>(0))
            .map(|rows| rows.filter_map(|r| r.ok()).collect())
            .unwrap_or_default(),
        Err(_) => vec![],
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn verify_pin(
    db: State<'_, AppDb>,
    session: State<'_, AuthSession>,
    user_id: i64,
    pin: String,
) -> Result<VerifyPinResult, String> {
    let mut result = db.with_conn(|conn| logic_verify_pin(conn, user_id, &pin))?;
    // Establish the Rust-side session on success so all subsequent commands
    // can read the trusted role and permissions without relying on frontend values.
    if let VerifyPinResult::Success { ref mut user } = result {
        let permissions = db.with_conn(|conn| Ok(load_role_permissions(conn, &user.role)))?;
        session.set(user.id, &user.role, &user.name, permissions.clone())?;
        user.permissions = permissions;
    }
    Ok(result)
}

#[tauri::command]
pub fn create_user_pin(
    db: State<'_, AppDb>,
    session: State<'_, AuthSession>,
    name: String,
    pin: String,
    role: String,
) -> Result<(), String> {
    db.with_conn(|conn| {
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0))
            .unwrap_or(0);
        if count > 0 {
            let sess = session.get()?;
            if sess.role != "admin" && !sess.permissions.iter().any(|p| p == "manage_users") {
                return Err("ERR_PERMISSION: manage_users required".into());
            }
        }
        logic_create_user(conn, &name, &pin, &role)
    })
}

#[tauri::command]
pub fn change_pin(
    db: State<'_, AppDb>,
    session: State<'_, AuthSession>,
    user_id: i64,
    new_pin: String,
) -> Result<(), String> {
    let sess = session.get()?;
    if sess.user_id != user_id && sess.role != "admin" {
        return Err("ERR_PERMISSION: cannot change another user's PIN".into());
    }
    db.with_conn(|conn| logic_change_pin(conn, user_id, &new_pin))
}

const SESSION_INACTIVITY_MS: i64 = 30 * 60 * 1000;
const SESSION_ABSOLUTE_MS: i64 = 8 * 60 * 60 * 1000;

pub fn validate_session_window(
    session_started_ms: i64,
    last_activity_ms: i64,
    now_ms: i64,
) -> Result<(), String> {
    if now_ms - last_activity_ms > SESSION_INACTIVITY_MS
        || now_ms - session_started_ms > SESSION_ABSOLUTE_MS
    {
        return Err("ERR_SESSION: session expired".into());
    }
    Ok(())
}

/// Repopulates Rust AuthSession after frontend reload when browser sessionStorage is still valid.
#[tauri::command]
pub fn restore_session(
    db: State<'_, AppDb>,
    session: State<'_, AuthSession>,
    user_id: i64,
    session_started_ms: i64,
    last_activity_ms: i64,
) -> Result<UserRecord, String> {
    let now_ms = chrono::Utc::now().timestamp_millis();
    validate_session_window(session_started_ms, last_activity_ms, now_ms)?;

    db.with_conn(|conn| {
        let user: UserRecord = conn
            .query_row(
                "SELECT id, name, role, is_active, created_at FROM users WHERE id=?1 AND is_active=1",
                [user_id],
                |row| {
                    Ok(UserRecord {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        role: row.get(2)?,
                        is_active: row.get(3)?,
                        created_at: row.get(4)?,
                        permissions: vec![],
                    })
                },
            )
            .map_err(|_| "ERR_SESSION: user not found or inactive".to_string())?;

        let permissions = load_role_permissions(conn, &user.role);
        session.set(user.id, &user.role, &user.name, permissions.clone())?;

        Ok(UserRecord {
            permissions,
            ..user
        })
    })
}

#[tauri::command]
pub fn update_user_info(
    db: State<'_, AppDb>,
    session: State<'_, AuthSession>,
    id: i64,
    name: String,
    role: String,
    is_active: bool,
) -> Result<(), String> {
    let sess = session.get()?;
    db.with_conn(|conn| logic_update_user_info(conn, id, &name, &role, is_active, &sess.role, &sess.permissions))
}

#[tauri::command]
pub fn logout(session: State<'_, AuthSession>) -> Result<(), String> {
    session.clear()
}

/// Active desktop session (single in-memory login). Admin-only read.
#[derive(Debug, serde::Serialize)]
pub struct CurrentSessionInfo {
    pub user_id: i64,
    pub user_name: String,
    pub role: String,
    pub logged_in_at: String,
    pub source: String,
}

#[tauri::command]
pub fn get_current_session(session: State<'_, AuthSession>) -> Result<CurrentSessionInfo, String> {
    let sess = require_admin_session(&session)?;
    Ok(CurrentSessionInfo {
        user_id: sess.user_id,
        user_name: sess.user_name,
        role: sess.role,
        logged_in_at: sess.logged_in_at,
        source: "tauri-main-window".to_string(),
    })
}

// ── audit read types & commands ────────────────────────────────────────────────

#[derive(Debug, serde::Serialize)]
pub struct AuthAuditEntry {
    pub id:           i64,
    pub user_id:      Option<i64>,
    pub event_type:   String,
    pub occurred_at:  String,
    pub details_json: String,
}

#[derive(Debug, serde::Serialize)]
pub struct AuthTelemetry {
    pub failed_attempts: i64,
    pub lock_events:     i64,
    pub unlock_events:   i64,
    pub login_successes: i64,
    pub pin_changes:     i64,
}

#[derive(Debug, serde::Serialize)]
pub struct AuthTelemetrySummary {
    pub window_1h:  AuthTelemetry,
    pub window_24h: AuthTelemetry,
}

#[derive(Debug, serde::Serialize)]
pub struct UserAuthTrend {
    pub user_id:             i64,
    pub user_name:           String,
    pub role:                String,
    pub failed_24h:          i64,
    pub lockouts_24h:        i64,
    pub login_successes_24h: i64,
}

#[derive(Debug, serde::Serialize)]
pub struct ChainVerifyResult {
    pub is_valid:        bool,
    pub total_rows:      i64,
    pub hashed_rows:     i64,
    pub first_broken_id: Option<i64>,
}

#[derive(Debug, serde::Serialize)]
pub struct SecurityEvent {
    pub id:          i64,
    pub command:     String,
    pub user_id:     Option<i64>,
    pub reason:      String,
    pub occurred_at: String,
}

fn logic_get_auth_audit_log(
    conn: &Connection,
    limit: Option<i64>,
    user_id: Option<i64>,
) -> Result<Vec<AuthAuditEntry>, String> {
    let lim = limit.unwrap_or(50);
    let mut stmt = conn
        .prepare(
            "SELECT id, user_id, event_type, occurred_at, details_json \
             FROM auth_audit_log \
             WHERE (?1 IS NULL OR user_id = ?1) \
             ORDER BY occurred_at DESC \
             LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![user_id, lim], |row| {
            Ok(AuthAuditEntry {
                id:           row.get(0)?,
                user_id:      row.get(1)?,
                event_type:   row.get(2)?,
                occurred_at:  row.get(3)?,
                details_json: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

fn logic_get_auth_telemetry_window(
    conn: &Connection,
    hours: i64,
) -> Result<AuthTelemetry, String> {
    conn.query_row(
        "SELECT \
            SUM(CASE WHEN event_type='failed_attempt' THEN 1 ELSE 0 END), \
            SUM(CASE WHEN event_type='locked'         THEN 1 ELSE 0 END), \
            SUM(CASE WHEN event_type='unlocked'       THEN 1 ELSE 0 END), \
            SUM(CASE WHEN event_type='login_success'  THEN 1 ELSE 0 END), \
            SUM(CASE WHEN event_type='pin_changed'    THEN 1 ELSE 0 END) \
         FROM auth_audit_log \
         WHERE occurred_at >= datetime('now', '-' || ?1 || ' hours')",
        [hours],
        |row| {
            Ok(AuthTelemetry {
                failed_attempts: row.get::<_, Option<i64>>(0)?.unwrap_or(0),
                lock_events:     row.get::<_, Option<i64>>(1)?.unwrap_or(0),
                unlock_events:   row.get::<_, Option<i64>>(2)?.unwrap_or(0),
                login_successes: row.get::<_, Option<i64>>(3)?.unwrap_or(0),
                pin_changes:     row.get::<_, Option<i64>>(4)?.unwrap_or(0),
            })
        },
    )
    .map_err(|e| e.to_string())
}

fn logic_verify_audit_chain(conn: &Connection) -> Result<ChainVerifyResult, String> {
    struct AuditRow {
        id: i64, user_id: Option<i64>, event_type: String,
        occurred_at: String, details_json: String,
        prev_hash: String, entry_hash: String,
    }

    let mut stmt = conn.prepare(
        "SELECT id, user_id, event_type, occurred_at, details_json, prev_hash, entry_hash \
         FROM auth_audit_log ORDER BY id ASC",
    ).map_err(|e| e.to_string())?;

    let rows: Vec<AuditRow> = stmt.query_map([], |row| {
        Ok(AuditRow {
            id:           row.get(0)?,
            user_id:      row.get(1)?,
            event_type:   row.get(2)?,
            occurred_at:  row.get(3)?,
            details_json: row.get(4)?,
            prev_hash:    row.get(5)?,
            entry_hash:   row.get(6)?,
        })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;

    let total_rows = rows.len() as i64;
    let mut expected_prev = String::new();
    let mut hashed_rows: i64 = 0;

    for row in &rows {
        if row.entry_hash.is_empty() {
            // Legacy pre-chain row — skip hash validation, do not update expected_prev
            continue;
        }
        hashed_rows += 1;
        if row.prev_hash != expected_prev {
            return Ok(ChainVerifyResult {
                is_valid: false, total_rows, hashed_rows,
                first_broken_id: Some(row.id),
            });
        }
        let expected = compute_chain_entry_hash(
            &row.prev_hash, &row.event_type, row.user_id, &row.occurred_at, &row.details_json,
        );
        if expected != row.entry_hash {
            return Ok(ChainVerifyResult {
                is_valid: false, total_rows, hashed_rows,
                first_broken_id: Some(row.id),
            });
        }
        expected_prev = row.entry_hash.clone();
    }

    // NOTE: hashed_rows will be < total_rows on databases that ran migration 24 before
    // migration 25 shipped — those legacy rows have entry_hash='' and are intentionally
    // skipped. Chain verification only covers the post-migration hashed rows.
    Ok(ChainVerifyResult { is_valid: true, total_rows, hashed_rows, first_broken_id: None })
}

fn logic_get_auth_telemetry_summary(conn: &Connection) -> Result<AuthTelemetrySummary, String> {
    Ok(AuthTelemetrySummary {
        window_1h:  logic_get_auth_telemetry_window(conn, 1)?,
        window_24h: logic_get_auth_telemetry_window(conn, 24)?,
    })
}

fn logic_get_user_auth_trends(conn: &Connection) -> Result<Vec<UserAuthTrend>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT u.id, u.name, u.role,
                    COALESCE(SUM(CASE WHEN a.event_type='failed_attempt'
                        AND a.occurred_at >= datetime('now','-24 hours') THEN 1 END), 0),
                    COALESCE(SUM(CASE WHEN a.event_type='locked'
                        AND a.occurred_at >= datetime('now','-24 hours') THEN 1 END), 0),
                    COALESCE(SUM(CASE WHEN a.event_type='login_success'
                        AND a.occurred_at >= datetime('now','-24 hours') THEN 1 END), 0)
             FROM users u
             LEFT JOIN auth_audit_log a ON a.user_id = u.id
             GROUP BY u.id
             ORDER BY 4 DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(UserAuthTrend {
            user_id:             row.get(0)?,
            user_name:           row.get(1)?,
            role:                row.get(2)?,
            failed_24h:          row.get(3)?,
            lockouts_24h:        row.get(4)?,
            login_successes_24h: row.get(5)?,
        })
    })
    .map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;
    Ok(rows)
}

fn logic_get_security_events(
    conn: &Connection,
    limit: Option<i64>,
) -> Result<Vec<SecurityEvent>, String> {
    let lim = limit.unwrap_or(100);
    let mut stmt = conn
        .prepare(
            "SELECT id, command, user_id, reason, occurred_at \
             FROM security_event_log \
             ORDER BY occurred_at DESC, id DESC \
             LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([lim], |row| {
        Ok(SecurityEvent {
            id:          row.get(0)?,
            command:     row.get(1)?,
            user_id:     row.get(2)?,
            reason:      row.get(3)?,
            occurred_at: row.get(4)?,
        })
    })
    .map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn get_auth_audit_log(
    db: State<'_, AppDb>,
    session: State<'_, AuthSession>,
    limit: Option<i64>,
    user_id: Option<i64>,
) -> Result<Vec<AuthAuditEntry>, String> {
    require_admin_session(&session)?;
    db.with_conn(|conn| logic_get_auth_audit_log(conn, limit, user_id))
}

#[tauri::command]
pub fn get_auth_telemetry_window(
    db: State<'_, AppDb>,
    session: State<'_, AuthSession>,
    hours: i64,
) -> Result<AuthTelemetry, String> {
    require_admin_session(&session)?;
    db.with_conn(|conn| logic_get_auth_telemetry_window(conn, hours))
}

#[tauri::command]
pub fn verify_audit_chain(
    db: State<'_, AppDb>,
    session: State<'_, AuthSession>,
) -> Result<ChainVerifyResult, String> {
    let sess = session.get()?;
    if sess.role != "admin" {
        return Err("ERR_PERMISSION: verify_audit_chain requires admin role".into());
    }
    db.with_conn(logic_verify_audit_chain)
}

#[tauri::command]
pub fn get_auth_telemetry_summary(
    db: State<'_, AppDb>,
    session: State<'_, AuthSession>,
) -> Result<AuthTelemetrySummary, String> {
    require_admin_session(&session)?;
    db.with_conn(logic_get_auth_telemetry_summary)
}

#[tauri::command]
pub fn get_user_auth_trends(
    db: State<'_, AppDb>,
    session: State<'_, AuthSession>,
) -> Result<Vec<UserAuthTrend>, String> {
    let sess = session.get()?;
    if sess.role != "admin" {
        return Err("ERR_PERMISSION: get_user_auth_trends requires admin role".into());
    }
    db.with_conn(logic_get_user_auth_trends)
}

#[tauri::command]
pub fn get_security_events(
    db: State<'_, AppDb>,
    session: State<'_, AuthSession>,
    limit: Option<i64>,
) -> Result<Vec<SecurityEvent>, String> {
    let sess = session.get()?;
    if sess.role != "admin" {
        return Err("ERR_PERMISSION: get_security_events requires admin role".into());
    }
    db.with_conn(|conn| logic_get_security_events(conn, limit))
}

// ── tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use rusqlite::Connection;

    pub fn setup_users_table(conn: &Connection) {
        conn.execute_batch(
            "CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                pin_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'viewer',
                is_active INTEGER NOT NULL DEFAULT 1,
                failed_attempts INTEGER NOT NULL DEFAULT 0,
                locked_until TEXT DEFAULT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );",
        )
        .unwrap();
    }

    fn setup_audit_log_table(conn: &Connection) {
        conn.execute_batch(
            "CREATE TABLE auth_audit_log (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id      INTEGER NULL,
                event_type   TEXT NOT NULL,
                occurred_at  TEXT NOT NULL DEFAULT (datetime('now')),
                ip_or_source TEXT DEFAULT 'tauri-main-window',
                details_json TEXT NOT NULL DEFAULT '{}',
                created_by   INTEGER NULL,
                prev_hash    TEXT NOT NULL DEFAULT '',
                entry_hash   TEXT NOT NULL DEFAULT ''
            );",
        )
        .unwrap();
    }

    fn setup_both(conn: &Connection) {
        setup_users_table(conn);
        setup_audit_log_table(conn);
    }

    fn count_events(conn: &Connection, event_type: &str) -> i64 {
        conn.query_row(
            "SELECT COUNT(*) FROM auth_audit_log WHERE event_type=?1",
            [event_type],
            |r| r.get(0),
        )
        .unwrap_or(0)
    }

    fn is_success(r: &VerifyPinResult) -> bool {
        matches!(r, VerifyPinResult::Success { .. })
    }
    fn is_failed(r: &VerifyPinResult) -> bool {
        matches!(r, VerifyPinResult::Failed { .. })
    }
    fn is_locked(r: &VerifyPinResult) -> bool {
        matches!(r, VerifyPinResult::Locked { .. })
    }

    #[test]
    fn argon2_roundtrip() {
        let hash = hash_argon2("1234").unwrap();
        assert!(hash.starts_with("$argon2id$"), "unexpected prefix: {hash}");
        assert!(verify_argon2("1234", &hash));
        assert!(!verify_argon2("wrong", &hash));
    }

    #[test]
    fn sha256_hash_migrates_on_login() {
        let conn = Connection::open_in_memory().unwrap();
        setup_users_table(&conn);

        let old_hash = sha256_hex("5678");
        conn.execute(
            "INSERT INTO users (name, pin_hash, role) VALUES ('Alice', ?1, 'admin')",
            [&old_hash],
        )
        .unwrap();
        let user_id: i64 = conn
            .query_row("SELECT id FROM users WHERE name='Alice'", [], |r| r.get(0))
            .unwrap();

        // First login with legacy hash succeeds and upgrades the stored hash.
        let result = logic_verify_pin(&conn, user_id, "5678").unwrap();
        assert!(is_success(&result), "expected successful login");

        let new_hash: String = conn
            .query_row(
                "SELECT pin_hash FROM users WHERE id=?1",
                [user_id],
                |r| r.get(0),
            )
            .unwrap();
        assert!(
            new_hash.starts_with("$argon2id$"),
            "hash not upgraded, got: {new_hash}"
        );

        // Subsequent login uses Argon2id and still succeeds.
        let result2 = logic_verify_pin(&conn, user_id, "5678").unwrap();
        assert!(is_success(&result2));
    }

    #[test]
    fn wrong_pin_returns_failed() {
        let conn = Connection::open_in_memory().unwrap();
        setup_users_table(&conn);
        logic_create_user(&conn, "Bob", "9999", "operator").unwrap();
        let uid: i64 = conn
            .query_row("SELECT id FROM users WHERE name='Bob'", [], |r| r.get(0))
            .unwrap();
        assert!(is_failed(&logic_verify_pin(&conn, uid, "0000").unwrap()));
    }

    #[test]
    fn inactive_user_returns_failed() {
        let conn = Connection::open_in_memory().unwrap();
        setup_users_table(&conn);
        logic_create_user(&conn, "Charlie", "1111", "viewer").unwrap();
        let uid: i64 = conn
            .query_row(
                "SELECT id FROM users WHERE name='Charlie'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        conn.execute("UPDATE users SET is_active=0 WHERE id=?1", [uid])
            .unwrap();
        assert!(is_failed(&logic_verify_pin(&conn, uid, "1111").unwrap()));
    }

    #[test]
    fn create_user_stores_argon2_hash() {
        let conn = Connection::open_in_memory().unwrap();
        setup_users_table(&conn);
        logic_create_user(&conn, "Dave", "2222", "operator").unwrap();
        let hash: String = conn
            .query_row(
                "SELECT pin_hash FROM users WHERE name='Dave'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(hash.starts_with("$argon2id$"));
    }

    #[test]
    fn change_pin_replaces_hash() {
        let conn = Connection::open_in_memory().unwrap();
        setup_users_table(&conn);
        logic_create_user(&conn, "Eve", "3333", "admin").unwrap();
        let uid: i64 = conn
            .query_row("SELECT id FROM users WHERE name='Eve'", [], |r| r.get(0))
            .unwrap();

        logic_change_pin(&conn, uid, "4444").unwrap();

        assert!(is_failed(&logic_verify_pin(&conn, uid, "3333").unwrap()));
        assert!(is_success(&logic_verify_pin(&conn, uid, "4444").unwrap()));
    }

    #[test]
    fn lockout_triggers_after_max_failures() {
        let conn = Connection::open_in_memory().unwrap();
        setup_users_table(&conn);
        logic_create_user(&conn, "Frank", "1234", "admin").unwrap();
        let uid: i64 = conn
            .query_row("SELECT id FROM users WHERE name='Frank'", [], |r| r.get(0))
            .unwrap();

        // MAX_ATTEMPTS - 1 failures should not lock.
        for _ in 0..(MAX_ATTEMPTS - 1) {
            let r = logic_verify_pin(&conn, uid, "0000").unwrap();
            assert!(is_failed(&r), "should be Failed before threshold");
        }

        // The Nth failure crosses the threshold and locks the account.
        let r = logic_verify_pin(&conn, uid, "0000").unwrap();
        assert!(is_locked(&r), "should be Locked after {MAX_ATTEMPTS} failures");
    }

    #[test]
    fn correct_pin_rejected_while_locked() {
        let conn = Connection::open_in_memory().unwrap();
        setup_users_table(&conn);
        logic_create_user(&conn, "Grace", "5678", "operator").unwrap();
        let uid: i64 = conn
            .query_row("SELECT id FROM users WHERE name='Grace'", [], |r| r.get(0))
            .unwrap();

        // Manually lock the account using ISO 8601 format (matches production path).
        conn.execute(
            "UPDATE users SET failed_attempts=?1, \
             locked_until=strftime('%Y-%m-%dT%H:%M:%SZ','now','+30 minutes') WHERE id=?2",
            rusqlite::params![MAX_ATTEMPTS, uid],
        )
        .unwrap();

        let r = logic_verify_pin(&conn, uid, "5678").unwrap();
        assert!(is_locked(&r), "correct PIN must be rejected while locked");
    }

    #[test]
    fn success_resets_failed_counter() {
        let conn = Connection::open_in_memory().unwrap();
        setup_users_table(&conn);
        logic_create_user(&conn, "Hank", "4321", "viewer").unwrap();
        let uid: i64 = conn
            .query_row("SELECT id FROM users WHERE name='Hank'", [], |r| r.get(0))
            .unwrap();

        // A few failures.
        for _ in 0..3 {
            logic_verify_pin(&conn, uid, "0000").unwrap();
        }
        let count_before: i64 = conn
            .query_row("SELECT failed_attempts FROM users WHERE id=?1", [uid], |r| r.get(0))
            .unwrap();
        assert_eq!(count_before, 3);

        // Correct login resets counter.
        let r = logic_verify_pin(&conn, uid, "4321").unwrap();
        assert!(is_success(&r));
        let count_after: i64 = conn
            .query_row("SELECT failed_attempts FROM users WHERE id=?1", [uid], |r| r.get(0))
            .unwrap();
        assert_eq!(count_after, 0);
    }

    #[test]
    fn pin_too_short_rejected() {
        let conn = Connection::open_in_memory().unwrap();
        setup_users_table(&conn);
        assert!(logic_create_user(&conn, "Short", "123", "viewer").is_err());
    }

    #[test]
    fn pin_too_long_rejected() {
        let conn = Connection::open_in_memory().unwrap();
        setup_users_table(&conn);
        assert!(logic_create_user(&conn, "Long", "1234567", "viewer").is_err());
    }

    #[test]
    fn pin_non_digit_rejected() {
        let conn = Connection::open_in_memory().unwrap();
        setup_users_table(&conn);
        assert!(logic_create_user(&conn, "Alpha", "12ab", "viewer").is_err());
    }

    #[test]
    fn change_pin_validates_format() {
        let conn = Connection::open_in_memory().unwrap();
        setup_users_table(&conn);
        logic_create_user(&conn, "Ivan", "1234", "viewer").unwrap();
        let uid: i64 = conn
            .query_row("SELECT id FROM users WHERE name='Ivan'", [], |r| r.get(0))
            .unwrap();
        // Too short
        assert!(logic_change_pin(&conn, uid, "123").is_err());
        // Non-digit
        assert!(logic_change_pin(&conn, uid, "12ab").is_err());
        // Valid 6-digit PIN succeeds
        assert!(logic_change_pin(&conn, uid, "654321").is_ok());
    }

    #[test]
    fn remaining_attempts_decrements_correctly() {
        let conn = Connection::open_in_memory().unwrap();
        setup_users_table(&conn);
        logic_create_user(&conn, "Ivy", "1111", "operator").unwrap();
        let uid: i64 = conn
            .query_row("SELECT id FROM users WHERE name='Ivy'", [], |r| r.get(0))
            .unwrap();

        let r1 = logic_verify_pin(&conn, uid, "0000").unwrap();
        let VerifyPinResult::Failed { remaining_attempts: rem1 } = r1 else { panic!("expected Failed") };
        assert_eq!(rem1, MAX_ATTEMPTS - 1);

        let r2 = logic_verify_pin(&conn, uid, "0000").unwrap();
        let VerifyPinResult::Failed { remaining_attempts: rem2 } = r2 else { panic!("expected Failed") };
        assert_eq!(rem2, MAX_ATTEMPTS - 2);
    }

    // ── AuthSession unit tests ────────────────────────────────────────────────

    use crate::db::state::AuthSession;

    #[test]
    fn session_empty_on_creation() {
        let s = AuthSession::new();
        assert!(s.get().is_err(), "fresh session should have no identity");
    }

    #[test]
    fn load_role_permissions_admin_returns_full_set_without_db() {
        // Admin path must never touch the DB — pass a closed connection path.
        let conn = Connection::open_in_memory().unwrap();
        // Do not create role_permissions table — admin must not query it.
        let perms = super::load_role_permissions(&conn, "admin");
        assert!(perms.contains(&"create_invoice".to_string()));
        assert!(perms.contains(&"manage_users".to_string()));
        assert!(perms.contains(&"finalize_invoice".to_string()));
    }

    #[test]
    fn load_role_permissions_operator_reads_db() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE role_permissions (
                role TEXT NOT NULL, permission TEXT NOT NULL, granted INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_by INTEGER, PRIMARY KEY (role, permission)
            );
            INSERT INTO role_permissions VALUES ('operator','create_invoice',1,'',NULL);
            INSERT INTO role_permissions VALUES ('operator','edit_invoice',0,'',NULL);",
        ).unwrap();

        let perms = super::load_role_permissions(&conn, "operator");
        assert!(perms.contains(&"create_invoice".to_string()), "granted perm should be present");
        assert!(!perms.contains(&"edit_invoice".to_string()), "revoked perm should be absent");
    }

    #[test]
    fn load_role_permissions_missing_table_returns_empty() {
        let conn = Connection::open_in_memory().unwrap();
        // No table created — should return empty vec, not panic.
        let perms = super::load_role_permissions(&conn, "operator");
        assert!(perms.is_empty(), "missing table should yield empty permissions");
    }

    #[test]
    fn session_set_and_get_returns_correct_identity() {
        let s = AuthSession::new();
        s.set(42, "admin", "Admin", vec!["create_invoice".into()]).unwrap();
        let id = s.get().unwrap();
        assert_eq!(id.user_id, 42);
        assert_eq!(id.role, "admin");
    }

    #[test]
    fn session_clear_removes_identity() {
        let s = AuthSession::new();
        s.set(1, "operator", "Op", vec![]).unwrap();
        s.clear().unwrap();
        assert!(s.get().is_err(), "session should be empty after clear");
    }

    #[test]
    fn forged_role_attempt_blocked_without_session() {
        // Simulates what a malicious caller would have to do:
        // try to run a privileged command with no session established.
        // The `session.get()` call inside the command returns Err, blocking it.
        let s = AuthSession::new();
        let err = s.get().unwrap_err();
        assert!(err.contains("No active session"), "got: {err}");
    }

    #[test]
    fn session_role_propagates_to_rbac_correctly() {
        // Verifies that the role stored in AuthSession is exactly what RBAC
        // logic receives — a viewer stored in session cannot mutate to admin.
        let s = AuthSession::new();
        s.set(99, "viewer", "View", vec![]).unwrap();
        let id = s.get().unwrap();

        // Pass stored role to a privileged logic function; expect denial.
        let conn = Connection::open_in_memory().unwrap();
        setup_users_table(&conn);
        let err = logic_update_user_info(&conn, 1, "Alice", "admin", true, &id.role, &[])
            .unwrap_err();
        assert!(err.contains("ERR_PERMISSION:"), "viewer should be denied, got: {err}");
    }

    // ── audit log tests ───────────────────────────────────────────────────────

    #[test]
    fn failed_attempt_writes_audit_row() {
        let conn = Connection::open_in_memory().unwrap();
        setup_both(&conn);
        logic_create_user(&conn, "Jack", "2222", "viewer").unwrap();
        let uid: i64 = conn
            .query_row("SELECT id FROM users WHERE name='Jack'", [], |r| r.get(0))
            .unwrap();

        logic_verify_pin(&conn, uid, "0000").unwrap();

        assert_eq!(count_events(&conn, "failed_attempt"), 1);
        let details: String = conn
            .query_row(
                "SELECT details_json FROM auth_audit_log WHERE event_type='failed_attempt'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(details.contains("remaining_attempts"), "details_json: {details}");
    }

    #[test]
    fn lock_event_writes_row_with_until() {
        let conn = Connection::open_in_memory().unwrap();
        setup_both(&conn);
        logic_create_user(&conn, "Kate", "3333", "operator").unwrap();
        let uid: i64 = conn
            .query_row("SELECT id FROM users WHERE name='Kate'", [], |r| r.get(0))
            .unwrap();

        for _ in 0..MAX_ATTEMPTS {
            logic_verify_pin(&conn, uid, "0000").unwrap();
        }

        assert_eq!(count_events(&conn, "locked"), 1);
        let details: String = conn
            .query_row(
                "SELECT details_json FROM auth_audit_log WHERE event_type='locked'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(details.contains("until"), "details_json: {details}");
        assert!(details.contains("lockout_minutes"), "details_json: {details}");
    }

    #[test]
    fn success_after_failures_writes_unlocked_and_login_success() {
        let conn = Connection::open_in_memory().unwrap();
        setup_both(&conn);
        logic_create_user(&conn, "Leo", "4444", "admin").unwrap();
        let uid: i64 = conn
            .query_row("SELECT id FROM users WHERE name='Leo'", [], |r| r.get(0))
            .unwrap();

        // 2 failures then correct PIN
        logic_verify_pin(&conn, uid, "0000").unwrap();
        logic_verify_pin(&conn, uid, "0000").unwrap();
        let r = logic_verify_pin(&conn, uid, "4444").unwrap();
        assert!(is_success(&r));

        assert_eq!(count_events(&conn, "unlocked"), 1);
        assert_eq!(count_events(&conn, "login_success"), 1);
        let details: String = conn
            .query_row(
                "SELECT details_json FROM auth_audit_log WHERE event_type='unlocked'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(details.contains("prior_attempts"), "details_json: {details}");
    }

    #[test]
    fn change_pin_writes_audit_row() {
        let conn = Connection::open_in_memory().unwrap();
        setup_both(&conn);
        logic_create_user(&conn, "Mia", "5555", "viewer").unwrap();
        let uid: i64 = conn
            .query_row("SELECT id FROM users WHERE name='Mia'", [], |r| r.get(0))
            .unwrap();

        logic_change_pin(&conn, uid, "6666").unwrap();

        assert_eq!(count_events(&conn, "pin_changed"), 1);
        let stored_uid: Option<i64> = conn
            .query_row(
                "SELECT user_id FROM auth_audit_log WHERE event_type='pin_changed'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(stored_uid, Some(uid));
    }

    #[test]
    fn verify_chain_passes_on_intact_log() {
        let conn = Connection::open_in_memory().unwrap();
        setup_users_table(&conn);
        setup_audit_log_table(&conn);

        log_auth_event(&conn, Some(1), "login_success", "{}");
        log_auth_event(&conn, Some(1), "pin_changed", "{}");
        log_auth_event(&conn, None, "failed_attempt", r#"{"remaining_attempts":5}"#);

        let result = logic_verify_audit_chain(&conn).unwrap();
        assert!(result.is_valid, "intact chain should be valid");
        assert_eq!(result.hashed_rows, 3);
        assert!(result.first_broken_id.is_none());
    }

    #[test]
    fn verify_chain_detects_tampered_row() {
        let conn = Connection::open_in_memory().unwrap();
        setup_users_table(&conn);
        setup_audit_log_table(&conn);

        log_auth_event(&conn, Some(1), "login_success", "{}");
        log_auth_event(&conn, Some(1), "pin_changed", "{}");

        // Simulate a tamper: overwrite the first row's entry_hash
        conn.execute(
            "UPDATE auth_audit_log SET entry_hash='deadbeef' WHERE id=1",
            [],
        ).unwrap();

        let result = logic_verify_audit_chain(&conn).unwrap();
        assert!(!result.is_valid, "tampered chain should be invalid");
        assert!(result.first_broken_id.is_some());
    }

    #[test]
    fn log_security_event_inserts_row() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE security_event_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                command TEXT NOT NULL,
                user_id INTEGER NULL,
                reason TEXT NOT NULL,
                occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
            );",
        ).unwrap();

        log_security_event(&conn, "create_invoice", Some(7),
            "ERR_PERMISSION: create_invoice requires admin or operator role");

        let (cmd, uid, reason): (String, Option<i64>, String) = conn.query_row(
            "SELECT command, user_id, reason FROM security_event_log LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        ).unwrap();
        assert_eq!(cmd, "create_invoice");
        assert_eq!(uid, Some(7));
        assert!(reason.contains("ERR_PERMISSION:"));
    }

    fn setup_security_event_log_table(conn: &Connection) {
        conn.execute_batch(
            "CREATE TABLE security_event_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                command TEXT NOT NULL,
                user_id INTEGER NULL,
                reason TEXT NOT NULL,
                occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
            );",
        ).unwrap();
    }

    #[test]
    fn get_security_events_returns_recent_denials() {
        let conn = Connection::open_in_memory().unwrap();
        setup_security_event_log_table(&conn);
        log_security_event(&conn, "delete_invoice", Some(3), "ERR_PERMISSION: admin only");
        log_security_event(&conn, "finalize_invoice", Some(5), "ERR_PERMISSION: admin only");

        let events = logic_get_security_events(&conn, Some(10)).unwrap();
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].command, "finalize_invoice"); // DESC order
    }

    #[test]
    fn telemetry_summary_returns_both_windows() {
        let conn = Connection::open_in_memory().unwrap();
        setup_audit_log_table(&conn);
        conn.execute_batch(
            "INSERT INTO auth_audit_log (event_type, prev_hash, entry_hash) \
             VALUES ('failed_attempt','','');
             INSERT INTO auth_audit_log (event_type, prev_hash, entry_hash) \
             VALUES ('locked','','');",
        ).unwrap();

        let summary = logic_get_auth_telemetry_summary(&conn).unwrap();
        assert_eq!(summary.window_1h.failed_attempts, 1);
        assert_eq!(summary.window_24h.failed_attempts, 1);
        assert_eq!(summary.window_1h.lock_events, 1);
    }

    #[test]
    fn user_auth_trends_groups_by_user() {
        let conn = Connection::open_in_memory().unwrap();
        setup_users_table(&conn);
        setup_audit_log_table(&conn);
        logic_create_user(&conn, "Alice", "1111", "admin").unwrap();
        let uid: i64 = conn
            .query_row("SELECT id FROM users WHERE name='Alice'", [], |r| r.get(0))
            .unwrap();

        conn.execute(
            "INSERT INTO auth_audit_log (user_id, event_type, prev_hash, entry_hash) \
             VALUES (?1,'failed_attempt','','');",
            [uid],
        ).unwrap();
        conn.execute(
            "INSERT INTO auth_audit_log (user_id, event_type, prev_hash, entry_hash) \
             VALUES (?1,'failed_attempt','','');",
            [uid],
        ).unwrap();

        let trends = logic_get_user_auth_trends(&conn).unwrap();
        let alice = trends.iter().find(|t| t.user_name == "Alice").unwrap();
        assert_eq!(alice.failed_24h, 2);
    }

    #[test]
    fn log_auth_event_stores_valid_hash_chain() {
        let conn = Connection::open_in_memory().unwrap();
        setup_users_table(&conn);
        setup_audit_log_table(&conn);

        // First event: prev_hash must be empty, entry_hash must be 64 hex chars
        log_auth_event(&conn, Some(1), "login_success", "{}");
        let (prev1, hash1): (String, String) = conn.query_row(
            "SELECT prev_hash, entry_hash FROM auth_audit_log ORDER BY id ASC LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        ).unwrap();
        assert_eq!(prev1, "", "first row prev_hash must be empty");
        assert_eq!(hash1.len(), 64, "entry_hash must be 64-char SHA-256 hex");

        // Second event: prev_hash must equal first row's entry_hash
        log_auth_event(&conn, Some(1), "pin_changed", "{}");
        let (prev2, _hash2): (String, String) = conn.query_row(
            "SELECT prev_hash, entry_hash FROM auth_audit_log ORDER BY id DESC LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        ).unwrap();
        assert_eq!(prev2, hash1, "second row prev_hash must equal first row entry_hash");
    }

    #[test]
    fn hash_chain_columns_present_in_table() {
        let conn = Connection::open_in_memory().unwrap();
        setup_users_table(&conn);
        setup_audit_log_table(&conn);
        // Confirm via pragma — fails until setup_audit_log_table includes the new columns
        let cols: Vec<String> = {
            let mut s = conn.prepare("PRAGMA table_info(auth_audit_log)").unwrap();
            s.query_map([], |r| r.get::<_, String>(1)).unwrap()
                .collect::<Result<Vec<_>, _>>().unwrap()
        };
        assert!(cols.contains(&"prev_hash".to_string()), "prev_hash column missing");
        assert!(cols.contains(&"entry_hash".to_string()), "entry_hash column missing");
    }

    #[test]
    fn telemetry_aggregates_correctly() {
        let conn = Connection::open_in_memory().unwrap();
        setup_both(&conn);

        // Insert known rows directly to avoid Argon2 overhead
        conn.execute_batch(
            "INSERT INTO auth_audit_log (event_type) VALUES ('failed_attempt');
             INSERT INTO auth_audit_log (event_type) VALUES ('failed_attempt');
             INSERT INTO auth_audit_log (event_type) VALUES ('locked');
             INSERT INTO auth_audit_log (event_type) VALUES ('unlocked');
             INSERT INTO auth_audit_log (event_type) VALUES ('login_success');
             INSERT INTO auth_audit_log (event_type) VALUES ('login_success');
             INSERT INTO auth_audit_log (event_type) VALUES ('login_success');
             INSERT INTO auth_audit_log (event_type) VALUES ('pin_changed');",
        )
        .unwrap();

        let t = logic_get_auth_telemetry_window(&conn, 1).unwrap();
        assert_eq!(t.failed_attempts, 2);
        assert_eq!(t.lock_events, 1);
        assert_eq!(t.unlock_events, 1);
        assert_eq!(t.login_successes, 3);
        assert_eq!(t.pin_changes, 1);
    }

    #[test]
    fn fail_secure_denies_when_lockout_unparseable() {
        let conn = Connection::open_in_memory().unwrap();
        setup_users_table(&conn);
        logic_create_user(&conn, "Locked", "1234", "admin").unwrap();
        let uid: i64 = conn
            .query_row("SELECT id FROM users WHERE name='Locked'", [], |r| r.get(0))
            .unwrap();
        conn.execute(
            "UPDATE users SET locked_until='not-a-datetime' WHERE id=?1",
            [uid],
        )
        .unwrap();
        assert!(matches!(
            logic_verify_pin(&conn, uid, "1234").unwrap(),
            VerifyPinResult::Locked { .. }
        ));
    }

    #[test]
    fn validate_session_window_rejects_expired_idle() {
        let now = 1_000_000_000_i64;
        let started = now - 60_000;
        let last = now - SESSION_INACTIVITY_MS - 1;
        assert!(validate_session_window(started, last, now).is_err());
    }

    #[test]
    fn change_pin_requires_active_session() {
        let session = AuthSession::new();
        assert!(session.get().unwrap_err().contains("No active session"));
    }

    #[test]
    fn require_admin_denies_operator_session() {
        let session = AuthSession::new();
        session.set(2, "operator", "Op", vec![]).unwrap();
        let err = crate::rbac::require_admin_session(&session).unwrap_err();
        assert!(err.contains("ERR_PERMISSION"));
    }

    // get_auth_telemetry_summary now guards on require_admin_session; these assert
    // the same guard the command applies before reading telemetry.
    #[test]
    fn telemetry_summary_denies_unauthenticated() {
        let session = AuthSession::new();
        let err = crate::rbac::require_admin_session(&session).unwrap_err();
        assert!(err.contains("No active session"));
    }

    #[test]
    fn telemetry_summary_denies_operator() {
        let session = AuthSession::new();
        session.set(2, "operator", "Op", vec![]).unwrap();
        let err = crate::rbac::require_admin_session(&session).unwrap_err();
        assert!(err.contains("ERR_PERMISSION"));
    }
}
