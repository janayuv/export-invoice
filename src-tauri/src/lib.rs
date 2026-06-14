mod commands;
mod db;
mod logging;
mod rbac;
mod validation;

use tauri::Manager;

use db::schema::get_migrations;
use db::state::{resolve_db_url, AppDb, AuthSession, DEFAULT_DB_URL};

/// Copies the active DB to {stem}.pre-upgrade.{YYYY-MM-DD}.db in the same directory.
/// Skips silently if the backup for today already exists. Never aborts startup.
fn pre_upgrade_backup() {
    let src = db::state::resolve_db_file_path();
    if !src.exists() {
        return;
    }
    let stamp = chrono::Local::now().format("%Y-%m-%d");
    let stem = src.file_stem().unwrap_or_default().to_string_lossy();
    let bak = src.with_file_name(format!("{stem}.pre-upgrade.{stamp}.db"));
    if !bak.exists() {
        if let Err(e) = std::fs::copy(&src, &bak) {
            eprintln!("[startup] pre-upgrade backup failed: {e}");
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Record any panic to the app log before anything else runs. Best-effort;
    // chains the default hook so stderr output is preserved.
    logging::install_panic_hook();

    // Logging init is best-effort and must not block or abort startup.
    std::thread::spawn(|| {
        let _ = logging::init_logging();
    });

    // Apply any staged restore BEFORE migrations run so the plugin pool opens the
    // restored file.  Errors are logged to stderr but never abort startup.
    eprintln!("[startup] checking for staged restore");
    match commands::backup::apply_pending_restore() {
        Some(dest) => eprintln!("[startup] restore applied to: {dest}"),
        None => eprintln!("[startup] no staged restore — starting with current database"),
    }

    // Take a pre-upgrade snapshot so a botched migration can be recovered.
    pre_upgrade_backup();

    let db_url = resolve_db_url();
    eprintln!("[startup] active database URL: {db_url}");

    // Always register migrations for the default DB so behaviour is unchanged
    // when no custom DB is selected (reverting to default stays valid too).
    let mut sql_builder =
        tauri_plugin_sql::Builder::default().add_migrations(DEFAULT_DB_URL, get_migrations());

    // When a valid user DB is selected, register the same migration set under
    // its connection string.  tauri-plugin-sql applies migrations lazily on
    // Database.load, keyed by the exact connection string — so this is what
    // makes the chosen file get migrated instead of opened empty.
    if db_url != DEFAULT_DB_URL {
        sql_builder = sql_builder.add_migrations(&db_url, get_migrations());
    }

    tauri::Builder::default()
        // AppDb: lazy rusqlite connection for Rust-side write commands.
        // Opened on first command call so tauri-plugin-sql always applies
        // migrations before Rust code touches the database.
        .manage(AppDb::new())
        // AuthSession: trusted identity established on successful verify_pin.
        // Privileged commands read role from here — never from IPC params.
        .manage(AuthSession::new())
        .plugin(sql_builder.build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(30));
                    let db = handle.state::<AppDb>();
                    if let Err(e) = db.with_conn(commands::admin::maybe_run_scheduled_agent) {
                        eprintln!("[agent] scheduled tick failed: {e}");
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::auth::verify_pin,
            commands::auth::restore_session,
            commands::auth::logout,
            commands::auth::create_user_pin,
            commands::auth::change_pin,
            commands::auth::update_user_info,
            commands::auth::get_current_session,
            commands::auth::get_auth_audit_log,
            commands::auth::get_auth_telemetry_window,
            commands::auth::verify_audit_chain,
            commands::auth::get_auth_telemetry_summary,
            commands::auth::get_user_auth_trends,
            commands::auth::get_security_events,
            commands::invoice::create_invoice,
            commands::invoice::update_invoice,
            commands::invoice::delete_invoice,
            commands::invoice::finalize_invoice,
            commands::invoice::duplicate_invoice,
            commands::purchase_order::create_purchase_order,
            commands::purchase_order::update_purchase_order,
            commands::purchase_order::delete_purchase_order,
            commands::purchase_order::set_po_status,
            commands::purchase_order::duplicate_purchase_order,
            commands::customer::create_customer,
            commands::customer::update_customer,
            commands::customer::delete_customer,
            commands::entry::create_entry,
            commands::entry::update_entry,
            commands::entry::delete_entry,
            commands::settings::save_company_settings,
            commands::settings::save_company_logo,
            commands::backup::backup_database,
            commands::backup::verify_backup,
            commands::backup::validate_and_stage_restore,
            commands::admin::ensure_database_schema,
            commands::admin::get_role_permissions,
            commands::admin::set_role_permission,
            commands::admin::admin_db_overview,
            commands::admin::admin_browse_table,
            commands::admin::get_activity_log,
            commands::admin::get_activity_log_count,
            commands::admin::get_system_health,
            commands::admin::get_security_trends,
            commands::admin::get_automation_tasks,
            commands::admin::get_incidents,
            commands::admin::create_incident,
            commands::admin::resolve_incident,
            commands::admin::get_agent_settings,
            commands::admin::update_agent_settings,
            commands::admin::run_agent_task,
            commands::admin::read_app_log_tail,
            commands::gdrive::gdrive_get_oauth_config,
            commands::gdrive::gdrive_save_oauth_config,
            commands::gdrive::gdrive_get_status,
            commands::gdrive::gdrive_start_auth,
            commands::gdrive::gdrive_backup_and_upload,
            commands::gdrive::gdrive_list_backups,
            commands::gdrive::gdrive_disconnect,
            commands::gdrive::gdrive_download_and_stage_restore,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
