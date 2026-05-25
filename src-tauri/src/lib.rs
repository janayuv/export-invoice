mod commands;
mod db;

use db::schema::get_migrations;
use db::state::{resolve_db_url, AppDb, AuthSession, DEFAULT_DB_URL};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db_url = resolve_db_url();

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
        .invoke_handler(tauri::generate_handler![
            commands::auth::verify_pin,
            commands::auth::logout,
            commands::auth::create_user_pin,
            commands::auth::change_pin,
            commands::auth::update_user_info,
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
            commands::purchase_order::create_purchase_order,
            commands::purchase_order::update_purchase_order,
            commands::purchase_order::delete_purchase_order,
            commands::purchase_order::set_po_status,
            commands::customer::create_customer,
            commands::customer::update_customer,
            commands::customer::delete_customer,
            commands::entry::create_entry,
            commands::entry::update_entry,
            commands::entry::delete_entry,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
