use std::path::PathBuf;
use std::sync::Mutex;
use rusqlite::Connection;

use super::schema::sync_pending_plugin_migrations;

const DEFAULT_DB_FILENAME: &str = "export_invoice.db";
const APP_IDENTIFIER: &str = "com.exportinvoice.app";
const SELECTION_FILE: &str = "selected_db.txt";

pub const DEFAULT_DB_URL: &str = "sqlite:export_invoice.db";

/// Returns %APPDATA%\<identifier>, which tauri-plugin-sql uses to resolve
/// `sqlite:` paths on Windows.
pub fn app_config_dir() -> Option<PathBuf> {
    let base = std::env::var_os("APPDATA")?;
    let mut dir = PathBuf::from(base);
    dir.push(APP_IDENTIFIER);
    Some(dir)
}

/// Returns the active `sqlite:<path>` connection string for tauri-plugin-sql.
/// Falls back to the default whenever the selection file is missing, empty,
/// or names a file not present on disk.
pub fn resolve_db_url() -> String {
    let Some(dir) = app_config_dir() else {
        return DEFAULT_DB_URL.to_string();
    };
    let selection = dir.join(SELECTION_FILE);
    let Ok(raw) = std::fs::read_to_string(&selection) else {
        return DEFAULT_DB_URL.to_string();
    };
    let path = raw.trim();
    if path.is_empty() || !std::path::Path::new(path).exists() {
        return DEFAULT_DB_URL.to_string();
    }
    format!("sqlite:{path}")
}

/// Resolves to the actual filesystem path for a rusqlite connection.
pub fn resolve_db_file_path() -> PathBuf {
    let Some(dir) = app_config_dir() else {
        return PathBuf::from(DEFAULT_DB_FILENAME);
    };
    let selection = dir.join(SELECTION_FILE);
    if let Ok(raw) = std::fs::read_to_string(&selection) {
        let path_str = raw.trim();
        if !path_str.is_empty() {
            let p = PathBuf::from(path_str);
            if p.exists() {
                return p;
            }
        }
    }
    dir.join(DEFAULT_DB_FILENAME)
}

// ── Auth session state ────────────────────────────────────────────────────────

/// Identity established after a successful `verify_pin` call.
/// Stored in Rust-managed state so the role cannot be forged from the frontend.
#[derive(Clone, Debug)]
pub struct SessionIdentity {
    pub user_id: i64,
    pub role: String,
    pub user_name: String,
    pub logged_in_at: String,
}

/// Tauri managed state holding the currently logged-in user.
/// `None` = no session (not logged in or explicitly logged out).
pub struct AuthSession(pub Mutex<Option<SessionIdentity>>);

impl AuthSession {
    pub fn new() -> Self {
        AuthSession(Mutex::new(None))
    }

    /// Records a new session after successful PIN verification.
    pub fn set(&self, user_id: i64, role: &str, user_name: &str) -> Result<(), String> {
        let mut guard = self.0.lock().map_err(|e| e.to_string())?;
        *guard = Some(SessionIdentity {
            user_id,
            role: role.to_string(),
            user_name: user_name.to_string(),
            logged_in_at: chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        });
        Ok(())
    }

    /// Clears the session on logout or inactivity timeout.
    pub fn clear(&self) -> Result<(), String> {
        let mut guard = self.0.lock().map_err(|e| e.to_string())?;
        *guard = None;
        Ok(())
    }

    /// Returns the active session identity, or an error if nobody is logged in.
    /// All privileged commands call this; a missing session blocks the command
    /// before any DB or RBAC logic runs.
    pub fn get(&self) -> Result<SessionIdentity, String> {
        let guard = self.0.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or_else(|| "No active session: please log in first".to_string())
    }
}

// ── DB connection state ───────────────────────────────────────────────────────

/// Tauri managed state wrapping a lazily-opened rusqlite connection.
///
/// The connection is opened on the first command call rather than at startup
/// so that tauri-plugin-sql always applies migrations before Rust code touches
/// the database.
pub struct AppDb(pub Mutex<Option<Connection>>);

impl AppDb {
    pub fn new() -> Self {
        AppDb(Mutex::new(None))
    }

    /// Acquire the connection (opening it if necessary) and call `f`.
    /// WAL mode, FK enforcement, and a 5 s busy-timeout are set on first open
    /// so the rusqlite connection coexists safely with the tauri-plugin-sql pool.
    pub fn with_conn<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Connection) -> Result<T, String>,
    {
        let mut guard = self.0.lock().map_err(|e| e.to_string())?;
        if guard.is_none() {
            let path = resolve_db_file_path();
            let conn = Connection::open(&path)
                .map_err(|e| format!("Cannot open DB at {}: {e}", path.display()))?;
            // PRAGMAs + idempotent DDL for tables that Rust commands own exclusively.
            // The IF NOT EXISTS guards make this a no-op when tauri-plugin-sql has
            // already applied migration v24; they are a safety net for scenarios where
            // the migration hasn't run yet (e.g. first launch with a new binary while
            // the frontend Database.load() hasn't fired, or an older installed build).
            conn.execute_batch(
                "PRAGMA journal_mode=WAL;
                 PRAGMA foreign_keys=ON;
                 PRAGMA busy_timeout=5000;
                 CREATE TABLE IF NOT EXISTS auth_audit_log (
                     id           INTEGER PRIMARY KEY AUTOINCREMENT,
                     user_id      INTEGER NULL,
                     event_type   TEXT    NOT NULL
                                      CHECK(event_type IN (
                                          'failed_attempt','locked','unlocked',
                                          'pin_changed','login_success'
                                      )),
                     occurred_at  TEXT    NOT NULL DEFAULT (datetime('now')),
                     ip_or_source TEXT    DEFAULT 'tauri-main-window',
                     details_json TEXT    NOT NULL DEFAULT '{}',
                     created_by   INTEGER NULL,
                     prev_hash    TEXT    NOT NULL DEFAULT '',
                     entry_hash   TEXT    NOT NULL DEFAULT ''
                 );
                 CREATE INDEX IF NOT EXISTS idx_auth_audit_user_time
                     ON auth_audit_log(user_id, occurred_at DESC);
                 CREATE INDEX IF NOT EXISTS idx_auth_audit_event_time
                     ON auth_audit_log(event_type, occurred_at DESC);",
            )
            .map_err(|e| format!("DB init error: {e}"))?;
            // Safety net for security_event_log (migration 26). Best-effort — errors
            // are silently ignored so a schema lag never blocks authentication.
            let _ = conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS security_event_log (
                     id          INTEGER PRIMARY KEY AUTOINCREMENT,
                     command     TEXT    NOT NULL,
                     user_id     INTEGER NULL,
                     reason      TEXT    NOT NULL,
                     occurred_at TEXT    NOT NULL DEFAULT (datetime('now'))
                 );",
            );
            sync_pending_plugin_migrations(&conn).map_err(|e| format!("DB init error: {e}"))?;
            *guard = Some(conn);
        }
        f(guard.as_ref().unwrap())
    }
}
