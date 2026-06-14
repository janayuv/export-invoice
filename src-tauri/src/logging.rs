//! Application logging to `%APPDATA%/com.exportinvoice.app/logs/app.log`.
//! Startup-safe: never panics; falls back to stderr when the log file is unavailable.

use std::fs::{self, OpenOptions};
use std::io;
use std::path::{Path, PathBuf};

use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use crate::db::state::app_config_dir;

const LOG_DIR: &str = "logs";
const LOG_FILE: &str = "app.log";

/// Resolved path for `app.log` under the app config directory.
pub fn app_log_file() -> Option<PathBuf> {
    let dir = app_config_dir()?;
    Some(dir.join(LOG_DIR).join(LOG_FILE))
}

/// Ensures the parent directory exists and is writable. Used by tests and init.
pub(crate) fn prepare_log_parent(path: &Path) -> Result<(), io::Error> {
    let Some(parent) = path.parent() else {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "log path has no parent",
        ));
    };
    fs::create_dir_all(parent)
}

/// Opens the log file for append. Returns `None` when setup fails (no panic).
pub(crate) fn open_log_append(path: &Path) -> Option<std::fs::File> {
    if prepare_log_parent(path).is_err() {
        return None;
    }
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .ok()
}

/// Returns true when file logging could be prepared (dir + open) without initializing tracing.
#[allow(dead_code)]
pub(crate) fn file_logging_available(path: &Path) -> bool {
    open_log_append(path).is_some()
}

fn default_filter() -> EnvFilter {
    EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"))
}

/// Initialize tracing subscriber. Never panics. Returns true when file logging is active.
pub fn init_logging() -> bool {
    let filter = default_filter();

    if let Some(path) = app_log_file() {
        if let Some(file) = open_log_append(&path) {
            let file_layer = fmt::layer()
                .with_writer(std::sync::Mutex::new(file))
                .with_ansi(false);
            let stderr_layer = fmt::layer().with_writer(io::stderr);
            if tracing_subscriber::registry()
                .with(filter)
                .with(file_layer)
                .with(stderr_layer)
                .try_init()
                .is_ok()
            {
                tracing::info!(path = %path.display(), "logging initialized (file + stderr)");
                return true;
            }
        }
    }

    let _ = fmt::Subscriber::builder()
        .with_env_filter(default_filter())
        .with_writer(io::stderr)
        .try_init();
    eprintln!("[startup] file logging unavailable; using stderr only");
    false
}

/// Installs a process-wide panic hook that records panics to the app log.
///
/// Best-effort and never itself panics: it logs through `tracing` (which reaches
/// the log file + stderr once the subscriber is active) and *also* appends
/// directly to `app.log` as a fallback for panics that occur before tracing is
/// initialized. The previous hook is chained so default stderr output is kept.
pub fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown".to_string());
        let payload = info.payload();
        let msg = payload
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| payload.downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "non-string panic payload".to_string());

        // Structured log: reaches file + stderr when the subscriber is active.
        tracing::error!(location = %location, payload = %msg, "panic");

        // Direct append fallback in case tracing is not yet initialized.
        if let Some(path) = app_log_file() {
            if let Some(mut file) = open_log_append(&path) {
                use std::io::Write;
                let ts = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
                let _ = writeln!(file, "{ts} PANIC at {location}: {msg}");
            }
        }

        // Preserve default hook behaviour (stderr print / configured abort).
        previous(info);
    }));
}

/// Read the last `limit` non-empty lines from the app log (newest last).
pub fn tail_log_lines(limit: usize) -> Result<Vec<String>, String> {
    let path = app_log_file().ok_or_else(|| "ERR_LOG: log file path unavailable".to_string())?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("ERR_LOG: cannot read log: {e}"))?;
    let mut lines: Vec<String> = content
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(str::to_string)
        .collect();
    if lines.len() > limit {
        lines = lines.split_off(lines.len() - limit);
    }
    Ok(lines)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_logging_unavailable_when_logs_parent_is_a_file() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let blocker = tmp.path().join("logs");
        fs::write(&blocker, "not a directory").expect("write blocker file");
        let log_path = blocker.join("app.log");
        assert!(
            prepare_log_parent(&log_path).is_err(),
            "create_dir_all should fail when parent path is a file"
        );
        assert!(!file_logging_available(&log_path));
    }

    #[test]
    fn open_log_append_succeeds_under_writable_dir() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let log_path = tmp.path().join("logs").join("app.log");
        assert!(file_logging_available(&log_path));
        assert!(log_path.exists());
    }
}
