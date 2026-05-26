use rusqlite::Connection;
use std::path::Path;
use tauri::State;

use crate::commands::auth::log_security_event;
use crate::db::state::{app_config_dir, AppDb, AuthSession};

const PENDING_RESTORE_FILE: &str = "pending_restore.txt";

// ── logic functions ───────────────────────────────────────────────────────────

pub fn logic_backup_database(
    conn: &Connection,
    dest_path: &str,
    acting_role: &str,
    session_user_id: Option<i64>,
) -> Result<(), String> {
    if acting_role != "admin" {
        log_security_event(
            conn,
            "backup_database",
            session_user_id,
            "ERR_PERMISSION: backup_database requires admin role",
        );
        return Err("ERR_PERMISSION: backup_database requires admin role".into());
    }
    if dest_path.trim().is_empty() {
        return Err("ERR_BACKUP: destination path must not be empty".into());
    }
    // VACUUM INTO creates a clean, defragmented copy while the DB is open.
    conn.execute("VACUUM INTO ?1", [dest_path])
        .map_err(|e| format!("ERR_BACKUP: {e}"))?;
    Ok(())
}

pub fn logic_validate_and_stage_restore(
    source_path: &str,
    acting_role: &str,
    session_user_id: Option<i64>,
    // Injected in tests; None uses real app_config_dir().
    config_dir_override: Option<&Path>,
) -> Result<(), String> {
    if acting_role != "admin" {
        // Best-effort security log; never fail the denial because of a log error.
        if let Ok(src_conn) = Connection::open(source_path) {
            log_security_event(
                &src_conn,
                "validate_and_stage_restore",
                session_user_id,
                "ERR_PERMISSION: validate_and_stage_restore requires admin role",
            );
        }
        return Err("ERR_PERMISSION: validate_and_stage_restore requires admin role".into());
    }

    if source_path.trim().is_empty() {
        return Err("ERR_RESTORE: source path must not be empty".into());
    }
    if !Path::new(source_path).exists() {
        return Err(format!("ERR_RESTORE: file not found: {source_path}"));
    }

    // Open the backup file with rusqlite (not the plugin pool) and run integrity_check.
    let src_conn = Connection::open(source_path)
        .map_err(|e| format!("ERR_RESTORE: cannot open file: {e}"))?;
    let result: String = src_conn
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .map_err(|e| format!("ERR_INTEGRITY: {e}"))?;
    if result.trim() != "ok" {
        return Err(format!("ERR_INTEGRITY: {result}"));
    }

    // Write the source path to pending_restore.txt — lib.rs actions it on next startup.
    let dir = match config_dir_override {
        Some(p) => p.to_path_buf(),
        None => app_config_dir().ok_or("ERR_RESTORE: cannot resolve app config dir")?,
    };
    let pending = dir.join(PENDING_RESTORE_FILE);
    std::fs::write(&pending, source_path)
        .map_err(|e| format!("ERR_RESTORE: cannot write pending restore file: {e}"))?;

    Ok(())
}

/// Called at startup (before migrations) to complete a staged restore.
/// Returns the destination path string if a restore was performed.
pub fn apply_pending_restore() -> Option<String> {
    let dir = app_config_dir()?;
    let pending = dir.join(PENDING_RESTORE_FILE);
    if !pending.exists() {
        return None;
    }
    let source = std::fs::read_to_string(&pending).ok()?;
    let source = source.trim();
    if source.is_empty() || !Path::new(source).exists() {
        let _ = std::fs::remove_file(&pending);
        return None;
    }
    let dest = crate::db::state::resolve_db_file_path();
    if let Err(e) = std::fs::copy(source, &dest) {
        eprintln!("[restore] copy failed: {e}");
        return None;
    }
    let _ = std::fs::remove_file(&pending);
    Some(dest.display().to_string())
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn backup_database(
    db: State<'_, AppDb>,
    session: State<'_, AuthSession>,
    dest_path: String,
) -> Result<(), String> {
    let sess = session.get()?;
    db.with_conn(|conn| logic_backup_database(conn, &dest_path, &sess.role, Some(sess.user_id)))
}

#[tauri::command]
pub fn validate_and_stage_restore(
    session: State<'_, AuthSession>,
    source_path: String,
) -> Result<(), String> {
    let sess = session.get()?;
    logic_validate_and_stage_restore(&source_path, &sess.role, Some(sess.user_id), None)
}

// ── tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::io::Write as IoWrite;
    use tempfile::TempDir;

    fn create_test_db() -> (TempDir, Connection) {
        let dir = TempDir::new().unwrap();
        let conn = Connection::open(dir.path().join("test.db")).unwrap();
        conn.execute_batch(
            r#"
            PRAGMA foreign_keys=ON;
            CREATE TABLE security_event_log (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                command     TEXT NOT NULL,
                user_id     INTEGER NULL,
                reason      TEXT NOT NULL,
                occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE invoices (id INTEGER PRIMARY KEY, name TEXT);
            INSERT INTO invoices VALUES (1, 'test');
            "#,
        )
        .unwrap();
        (dir, conn)
    }

    // ── backup RBAC ─────────────────────────────────────────────────────────

    #[test]
    fn backup_denied_for_operator() {
        let (dir, conn) = create_test_db();
        let dest = dir.path().join("out.db").display().to_string();
        let err = logic_backup_database(&conn, &dest, "operator", None).unwrap_err();
        assert!(err.starts_with("ERR_PERMISSION:"), "got: {err}");
    }

    #[test]
    fn backup_denied_for_viewer() {
        let (dir, conn) = create_test_db();
        let dest = dir.path().join("out.db").display().to_string();
        let err = logic_backup_database(&conn, &dest, "viewer", None).unwrap_err();
        assert!(err.starts_with("ERR_PERMISSION:"), "got: {err}");
    }

    #[test]
    fn backup_succeeds_for_admin() {
        let (dir, conn) = create_test_db();
        let dest = dir.path().join("backup.db").display().to_string();
        logic_backup_database(&conn, &dest, "admin", None).unwrap();
        assert!(Path::new(&dest).exists());
        let backup_conn = Connection::open(&dest).unwrap();
        let result: String = backup_conn
            .query_row("PRAGMA integrity_check", [], |r| r.get(0))
            .unwrap();
        assert_eq!(result, "ok");
    }

    #[test]
    fn backup_empty_dest_returns_error() {
        let (_dir, conn) = create_test_db();
        let err = logic_backup_database(&conn, "", "admin", None).unwrap_err();
        assert!(err.starts_with("ERR_BACKUP:"), "got: {err}");
    }

    // ── restore RBAC ────────────────────────────────────────────────────────

    #[test]
    fn restore_denied_for_operator() {
        let (dir, _conn) = create_test_db();
        let src = dir.path().join("test.db").display().to_string();
        let config_dir = TempDir::new().unwrap();
        let err =
            logic_validate_and_stage_restore(&src, "operator", None, Some(config_dir.path()))
                .unwrap_err();
        assert!(err.starts_with("ERR_PERMISSION:"), "got: {err}");
    }

    #[test]
    fn restore_denied_for_viewer() {
        let (dir, _conn) = create_test_db();
        let src = dir.path().join("test.db").display().to_string();
        let config_dir = TempDir::new().unwrap();
        let err =
            logic_validate_and_stage_restore(&src, "viewer", None, Some(config_dir.path()))
                .unwrap_err();
        assert!(err.starts_with("ERR_PERMISSION:"), "got: {err}");
    }

    #[test]
    fn restore_rejects_corrupt_file() {
        let dir = TempDir::new().unwrap();
        let corrupt = dir.path().join("corrupt.db");
        let mut f = std::fs::File::create(&corrupt).unwrap();
        f.write_all(b"this is not a valid sqlite file at all!!").unwrap();
        let config_dir = TempDir::new().unwrap();
        let err = logic_validate_and_stage_restore(
            &corrupt.display().to_string(),
            "admin",
            None,
            Some(config_dir.path()),
        )
        .unwrap_err();
        assert!(
            err.starts_with("ERR_INTEGRITY:") || err.starts_with("ERR_RESTORE:"),
            "got: {err}"
        );
    }

    #[test]
    fn restore_rejects_nonexistent_file() {
        let config_dir = TempDir::new().unwrap();
        let err = logic_validate_and_stage_restore(
            "/nonexistent/path/file.db",
            "admin",
            None,
            Some(config_dir.path()),
        )
        .unwrap_err();
        assert!(err.starts_with("ERR_RESTORE:"), "got: {err}");
    }

    #[test]
    fn restore_stages_valid_file() {
        let (dir, _conn) = create_test_db();
        let src = dir.path().join("test.db").display().to_string();
        let config_dir = TempDir::new().unwrap();
        logic_validate_and_stage_restore(&src, "admin", None, Some(config_dir.path())).unwrap();
        let pending = config_dir.path().join(PENDING_RESTORE_FILE);
        assert!(pending.exists(), "pending_restore.txt was not created");
        let content = std::fs::read_to_string(&pending).unwrap();
        assert_eq!(content.trim(), src.trim());
    }
}
