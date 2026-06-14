use rusqlite::Connection;
use std::path::Path;
use tauri::State;

use crate::commands::admin::{record_automation_task, TASK_BACKUP};
use crate::commands::auth::log_security_event;
use crate::db::state::{app_config_dir, AppDb, AuthSession};

const PENDING_RESTORE_FILE: &str = "pending_restore.txt";
/// Stable file in the app config dir that holds a GDrive-downloaded backup
/// waiting to be applied on next startup. Named distinctly so `apply_pending_restore`
/// can clean it up after a successful copy without touching the user's own backup files.
pub const STAGED_RESTORE_FILE: &str = "gdrive_staged_restore.db";

// ── helpers ───────────────────────────────────────────────────────────────────

/// Streams the file at `path` through SHA-256 in 64 KiB chunks.
/// Avoids loading the entire backup into RAM; safe for large databases.
fn compute_sha256(path: &str) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    use std::io::{BufReader, Read};
    let file = std::fs::File::open(path)
        .map_err(|e| format!("ERR_VERIFY: cannot read file for SHA-256: {e}"))?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 65536];
    loop {
        let n = reader
            .read(&mut buf)
            .map_err(|e| format!("ERR_VERIFY: SHA-256 read error: {e}"))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// Runs quick_check then full integrity_check on an already-open connection.
/// Scans ALL integrity_check rows to decide pass/fail; keeps up to 3 for the
/// returned status string so callers don't see a truncated verdict.
fn perform_integrity_check(conn: &Connection) -> Result<String, String> {
    // Fast structural check first — catches severe page corruption cheaply.
    // Use prepare+query_map so every returned row is inspected, not just the first.
    let mut stmt = conn
        .prepare("PRAGMA quick_check")
        .map_err(|e| format!("ERR_INTEGRITY: {e}"))?;
    let quick_rows: Vec<String> = stmt
        .query_map([], |r| r.get(0))
        .map_err(|e| format!("ERR_INTEGRITY: {e}"))?
        .filter_map(|r| r.ok())
        .collect();
    if let Some(bad) = quick_rows.iter().find(|r| r.trim() != "ok") {
        return Err(format!("ERR_INTEGRITY: Quick check failed: {}", bad.trim()));
    }

    // Full check: collect every row so pass/fail is decided on the complete set.
    let mut stmt = conn
        .prepare("PRAGMA integrity_check")
        .map_err(|e| format!("ERR_INTEGRITY: {e}"))?;
    let all_rows: Vec<String> = stmt
        .query_map([], |r| r.get(0))
        .map_err(|e| format!("ERR_INTEGRITY: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    let passed = all_rows.iter().all(|r| r.trim() == "ok");
    if passed {
        Ok("ok".to_string())
    } else {
        // Surface up to 3 lines for display; pass/fail was decided from the full set above.
        let display = all_rows
            .iter()
            .take(3)
            .cloned()
            .collect::<Vec<_>>()
            .join("; ");
        Err(format!("ERR_INTEGRITY: {display}"))
    }
}

// ── BackupInfo ────────────────────────────────────────────────────────────────

/// Returned by `verify_backup`.
///
/// Note: `foreign_key_check` is deliberately excluded from this verification
/// path. Running it would surface orphaned-row data issues as verification
/// failures, producing false negatives on structurally valid backups. Add a
/// separate "deep verify" command if that level of checking is ever needed.
#[derive(Debug, serde::Serialize)]
pub struct BackupInfo {
    pub size_bytes: u64,
    pub integrity_status: String, // "ok" or up to 3 error lines joined by "; "
    pub table_count: usize,
    pub user_version: i64,  // PRAGMA user_version — schema epoch
    pub sha256: String,     // hex SHA-256 of the backup file bytes
    pub checked_at: String, // UTC ISO-8601 timestamp when verify ran
}

// ── logic functions ───────────────────────────────────────────────────────────

/// VACUUM INTO creates a fully-checkpointed, WAL-free copy even when the
/// source DB is in WAL mode. The output is a clean single-file database safe
/// to copy, move, or open independently.
/// `verify_backup` opens the output file with a fresh rusqlite connection so
/// it never races with the live DB.
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
    let start = std::time::Instant::now();
    conn.execute("VACUUM INTO ?1", [dest_path])
        .map_err(|e| format!("ERR_BACKUP: {e}"))?;
    let duration_ms = start.elapsed().as_millis() as i64;
    let _ = record_automation_task(
        conn,
        TASK_BACKUP,
        "completed",
        duration_ms,
        &format!("Manual backup: {dest_path}"),
    );
    Ok(())
}

pub fn logic_verify_backup(path: &str, acting_role: &str) -> Result<BackupInfo, String> {
    if acting_role != "admin" {
        return Err("ERR_PERMISSION: verify_backup requires admin role".into());
    }
    if path.trim().is_empty() || !Path::new(path).exists() {
        return Err(format!("ERR_VERIFY: file not found: {path}"));
    }

    let size_bytes = std::fs::metadata(path)
        .map_err(|e| format!("ERR_VERIFY: cannot read file metadata: {e}"))?
        .len();

    // Open with rusqlite directly — NOT the plugin pool (which is exclusively for the live DB).
    let conn =
        Connection::open(path).map_err(|e| format!("ERR_VERIFY: cannot open file: {e}"))?;

    let integrity_status = perform_integrity_check(&conn)?;

    let user_version: i64 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(|e| format!("ERR_VERIFY: {e}"))?;

    let table_count: usize = conn
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type='table'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| format!("ERR_VERIFY: {e}"))?;

    let sha256 = compute_sha256(path)?;
    let checked_at = chrono::Utc::now().to_rfc3339();

    Ok(BackupInfo {
        size_bytes,
        integrity_status,
        table_count,
        user_version,
        sha256,
        checked_at,
    })
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

    eprintln!("[restore] checking for pending restore: {}", pending.display());

    if !pending.exists() {
        eprintln!("[restore] no pending_restore.txt — skipping");
        return None;
    }

    let source = std::fs::read_to_string(&pending).ok()?;
    let source = source.trim();
    eprintln!("[restore] staged file path: {source}");

    if source.is_empty() {
        eprintln!("[restore] pending_restore.txt is empty — clearing and skipping");
        let _ = std::fs::remove_file(&pending);
        return None;
    }

    if !Path::new(source).exists() {
        eprintln!("[restore] staged file not found on disk — clearing pending and skipping");
        let _ = std::fs::remove_file(&pending);
        return None;
    }

    match std::fs::metadata(source) {
        Ok(m) => eprintln!("[restore] staged file size: {} bytes", m.len()),
        Err(e) => eprintln!("[restore] could not read staged file metadata: {e}"),
    }

    let dest = crate::db::state::resolve_db_file_path();
    eprintln!("[restore] destination DB path: {}", dest.display());

    // Remove stale WAL/SHM files before overwriting the DB.  If these files
    // exist from a previous session and we replace the DB file without removing
    // them, SQLite will try to apply the old WAL to the new database and
    // produce SQLITE_CORRUPT (error 11 — "disk image malformed").
    for suffix in &["-wal", "-shm"] {
        let side = dest.with_file_name(format!(
            "{}{}",
            dest.file_name().unwrap_or_default().to_string_lossy(),
            suffix
        ));
        if side.exists() {
            match std::fs::remove_file(&side) {
                Ok(()) => eprintln!("[restore] removed stale {suffix} file: {}", side.display()),
                Err(e) => eprintln!("[restore] could not remove {suffix} file: {e}"),
            }
        }
    }

    if let Err(e) = std::fs::copy(source, &dest) {
        eprintln!("[restore] copy failed: {e}");
        return None;
    }
    eprintln!("[restore] copy succeeded");

    match std::fs::remove_file(&pending) {
        Ok(()) => eprintln!("[restore] pending_restore.txt removed"),
        Err(e) => eprintln!("[restore] failed to remove pending_restore.txt: {e}"),
    }

    // Clean up the GDrive-staged restore file if present. This is a no-op for
    // local-file restores where the source is the user's own backup — that file
    // lives outside the config dir and is never touched here.
    match std::fs::remove_file(dir.join(STAGED_RESTORE_FILE)) {
        Ok(()) => eprintln!("[restore] gdrive_staged_restore.db removed"),
        Err(_) => eprintln!("[restore] gdrive_staged_restore.db not present (local-file restore or already cleaned)"),
    }

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
pub fn verify_backup(
    session: State<'_, AuthSession>,
    path: String,
) -> Result<BackupInfo, String> {
    let sess = session.get()?;
    logic_verify_backup(&path, &sess.role)
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

    // ── verify_backup ────────────────────────────────────────────────────────

    #[test]
    fn verify_valid_backup_returns_ok() {
        let (dir, conn) = create_test_db();
        let backup_path = dir.path().join("verify_test.db").display().to_string();
        logic_backup_database(&conn, &backup_path, "admin", None).unwrap();

        let info = logic_verify_backup(&backup_path, "admin").unwrap();
        assert_eq!(
            info.integrity_status, "ok",
            "integrity_status: {}",
            info.integrity_status
        );
        assert!(info.size_bytes > 0, "size_bytes should be > 0");
        assert_eq!(info.sha256.len(), 64, "SHA-256 should be 64 hex chars");
        assert!(!info.checked_at.is_empty());
    }

    #[test]
    fn verify_corrupt_file_returns_integrity_error() {
        let dir = TempDir::new().unwrap();
        let corrupt = dir.path().join("corrupt.db");
        let mut f = std::fs::File::create(&corrupt).unwrap();
        f.write_all(b"this is not a valid sqlite file at all!!").unwrap();
        let err = logic_verify_backup(&corrupt.display().to_string(), "admin").unwrap_err();
        assert!(
            err.starts_with("ERR_INTEGRITY:") || err.starts_with("ERR_VERIFY:"),
            "got: {err}"
        );
    }

    #[test]
    fn verify_nonexistent_file_returns_verify_error() {
        let err = logic_verify_backup("/nonexistent/path/backup.db", "admin").unwrap_err();
        assert!(err.starts_with("ERR_VERIFY:"), "got: {err}");
    }

    #[test]
    fn verify_denied_for_operator() {
        let (dir, conn) = create_test_db();
        let backup_path = dir.path().join("op_test.db").display().to_string();
        logic_backup_database(&conn, &backup_path, "admin", None).unwrap();
        let err = logic_verify_backup(&backup_path, "operator").unwrap_err();
        assert!(err.starts_with("ERR_PERMISSION:"), "got: {err}");
    }

    #[test]
    fn verify_denied_for_viewer() {
        let (dir, conn) = create_test_db();
        let backup_path = dir.path().join("viewer_test.db").display().to_string();
        logic_backup_database(&conn, &backup_path, "admin", None).unwrap();
        let err = logic_verify_backup(&backup_path, "viewer").unwrap_err();
        assert!(err.starts_with("ERR_PERMISSION:"), "got: {err}");
    }

    #[test]
    fn compute_sha256_is_consistent() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("hash_test.bin");
        std::fs::write(&path, b"hello world consistency check").unwrap();
        let path_str = path.display().to_string();
        let h1 = compute_sha256(&path_str).unwrap();
        let h2 = compute_sha256(&path_str).unwrap();
        assert_eq!(h1, h2, "SHA-256 must be deterministic");
        assert_eq!(h1.len(), 64);
    }
}
