mod commands;
mod db;

use db::schema::get_migrations;

/// Connection string for the bundled default database. tauri-plugin-sql resolves
/// the `sqlite:` path relative to the app config dir (%APPDATA%\<identifier>).
const DEFAULT_DB_URL: &str = "sqlite:export_invoice.db";

/// App identifier — must stay in sync with `identifier` in tauri.conf.json.
const APP_IDENTIFIER: &str = "com.exportinvoice.app";

/// File (in the app config dir) that records the user's chosen database path.
/// The Settings "Browse" UI currently persists the selection in the webview's
/// localStorage; a follow-up frontend change must mirror that same absolute path
/// into this file so the Rust side can register migrations for the chosen DB.
const SELECTION_FILE: &str = "selected_db.txt";

/// Returns %APPDATA%\<identifier>, which matches the directory tauri-plugin-sql
/// uses to resolve `sqlite:` paths on Windows (this product ships Windows-only,
/// so reading APPDATA avoids pulling in a path-resolution dependency just to
/// locate the selection file before the Tauri app handle exists).
fn app_config_dir() -> Option<std::path::PathBuf> {
    let base = std::env::var_os("APPDATA")?;
    let mut dir = std::path::PathBuf::from(base);
    dir.push(APP_IDENTIFIER);
    Some(dir)
}

/// Resolves the active database connection string.
///
/// Returns the user-selected DB (`sqlite:<absolute-path>`) only when the
/// selection file exists AND the referenced file is present on disk; every other
/// case falls back to the default DB. This guarantees a stale, empty, or moved
/// selection can never leave the app pointed at a missing database.
fn resolve_db_url() -> String {
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
    // Use the same `sqlite:` prefix the frontend builds, so the connection string
    // the plugin sees on `Database.load` matches this migration registration key.
    format!("sqlite:{path}")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db_url = resolve_db_url();

    // Always register migrations for the default DB so behavior is unchanged when
    // nothing is selected (and so reverting to the default remains valid).
    let mut sql_builder =
        tauri_plugin_sql::Builder::default().add_migrations(DEFAULT_DB_URL, get_migrations());

    // When a valid user DB is selected, register the same migration set under its
    // connection string. tauri-plugin-sql applies migrations lazily on
    // `Database.load`, keyed by the exact connection string — so this registration
    // is what makes the chosen file get migrated instead of opened empty. Migrations
    // run on load, not at boot, so registering a path here never forces a premature
    // connection to a drive that may be offline at startup.
    if db_url != DEFAULT_DB_URL {
        sql_builder = sql_builder.add_migrations(&db_url, get_migrations());
    }

    tauri::Builder::default()
        .plugin(sql_builder.build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        // Checks GitHub Releases for a signed update package and applies it
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
