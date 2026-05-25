use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rand_core::OsRng;
use rusqlite::{Connection, OptionalExtension};
use sha2::{Digest, Sha256};
use tauri::State;

use crate::db::state::{AppDb, AuthSession};

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

fn log_auth_event(conn: &Connection, user_id: Option<i64>, event_type: &str, details_json: &str) {
    // Best-effort: a failing audit write must never block authentication.
    let _ = conn.execute(
        "INSERT INTO auth_audit_log (user_id, event_type, details_json) VALUES (?1, ?2, ?3)",
        rusqlite::params![user_id, event_type, details_json],
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

    // Check active lockout.
    // Use datetime() on both sides so SQLite normalises any format difference
    // (bare "YYYY-MM-DD HH:MM:SS" vs ISO "YYYY-MM-DDTHH:MM:SSZ").
    if let Some(ref until) = locked_until {
        let still_locked: bool = conn
            .query_row(
                "SELECT datetime(?1) > datetime('now')",
                [until.as_str()],
                |r| r.get(0),
            )
            .unwrap_or(false);
        if still_locked {
            log_auth_event(conn, Some(user_id), "locked",
                &format!(r#"{{"until":"{until}","reason":"active_lockout"}}"#));
            return Ok(VerifyPinResult::Locked { until: until.clone() });
        }
        // Expired lockout — reset counter so we start fresh.
        let _ = conn.execute(
            "UPDATE users SET failed_attempts=0, locked_until=NULL WHERE id=?1",
            [user_id],
        );
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
) -> Result<(), String> {
    if acting_role != "admin" {
        return Err("Permission denied: manage_users requires admin role".into());
    }
    conn.execute(
        "UPDATE users SET name=?1, role=?2, is_active=?3, updated_at=datetime('now') WHERE id=?4",
        rusqlite::params![name.trim(), role, is_active as i64, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn verify_pin(
    db: State<'_, AppDb>,
    session: State<'_, AuthSession>,
    user_id: i64,
    pin: String,
) -> Result<VerifyPinResult, String> {
    let result = db.with_conn(|conn| logic_verify_pin(conn, user_id, &pin))?;
    // Establish the Rust-side session on success so all subsequent commands
    // can read the trusted role without relying on a frontend-supplied value.
    if let VerifyPinResult::Success { ref user } = result {
        session.set(user.id, &user.role)?;
    }
    Ok(result)
}

#[tauri::command]
pub fn create_user_pin(
    db: State<'_, AppDb>,
    name: String,
    pin: String,
    role: String,
) -> Result<(), String> {
    db.with_conn(|conn| logic_create_user(conn, &name, &pin, &role))
}

#[tauri::command]
pub fn change_pin(
    db: State<'_, AppDb>,
    user_id: i64,
    new_pin: String,
) -> Result<(), String> {
    db.with_conn(|conn| logic_change_pin(conn, user_id, &new_pin))
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
    db.with_conn(|conn| logic_update_user_info(conn, id, &name, &role, is_active, &sess.role))
}

#[tauri::command]
pub fn logout(session: State<'_, AuthSession>) -> Result<(), String> {
    session.clear()
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

#[tauri::command]
pub fn get_auth_audit_log(
    db: State<'_, AppDb>,
    limit: Option<i64>,
    user_id: Option<i64>,
) -> Result<Vec<AuthAuditEntry>, String> {
    db.with_conn(|conn| logic_get_auth_audit_log(conn, limit, user_id))
}

#[tauri::command]
pub fn get_auth_telemetry_window(
    db: State<'_, AppDb>,
    hours: i64,
) -> Result<AuthTelemetry, String> {
    db.with_conn(|conn| logic_get_auth_telemetry_window(conn, hours))
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
    fn session_set_and_get_returns_correct_identity() {
        let s = AuthSession::new();
        s.set(42, "admin").unwrap();
        let id = s.get().unwrap();
        assert_eq!(id.user_id, 42);
        assert_eq!(id.role, "admin");
    }

    #[test]
    fn session_clear_removes_identity() {
        let s = AuthSession::new();
        s.set(1, "operator").unwrap();
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
        s.set(99, "viewer").unwrap();
        let id = s.get().unwrap();

        // Pass stored role to a privileged logic function; expect denial.
        let conn = Connection::open_in_memory().unwrap();
        setup_users_table(&conn);
        let err = logic_update_user_info(&conn, 1, "Alice", "admin", true, &id.role)
            .unwrap_err();
        assert!(err.contains("Permission denied"), "viewer should be denied, got: {err}");
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
}
