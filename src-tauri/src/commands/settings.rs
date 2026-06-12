use rusqlite::Connection;
use tauri::State;

use crate::commands::auth::log_security_event;
use crate::db::state::{AppDb, AuthSession};

#[derive(Debug, serde::Deserialize)]
pub struct SettingsPayload {
    pub name: String,
    pub address: String,
    pub gstin: String,
    pub pan: String,
    pub iec: String,
    pub bank_name: String,
    pub bank_account: String,
    pub ifsc: String,
    pub swift: String,
    pub bank_ad_code: String,
    pub lut_arn_no: String,
    pub lut_arn_date: String,
    pub place: String,
    pub signatory_name: String,
    pub fiscal_year: String,
}

pub fn logic_save_company_settings(
    conn: &Connection,
    payload: &SettingsPayload,
    acting_role: &str,
    permissions: &[String],
    session_user_id: Option<i64>,
) -> Result<(), String> {
    if acting_role != "admin" && !permissions.iter().any(|p| p == "access_settings") {
        log_security_event(
            conn,
            "save_company_settings",
            session_user_id,
            "ERR_PERMISSION: access_settings not granted",
        );
        return Err("ERR_PERMISSION: access_settings not granted".into());
    }

    conn.execute(
        "UPDATE company_settings SET
            name=?1, address=?2, gstin=?3, pan=?4, iec=?5,
            bank_name=?6, bank_account=?7, ifsc=?8, swift=?9,
            bank_ad_code=?10, lut_arn_no=?11, lut_arn_date=?12,
            place=?13, signatory_name=?14, fiscal_year=?15,
            updated_at=datetime('now')
         WHERE id=1",
        rusqlite::params![
            payload.name.trim(),
            payload.address.trim(),
            payload.gstin.trim(),
            payload.pan.trim(),
            payload.iec.trim(),
            payload.bank_name.trim(),
            payload.bank_account.trim(),
            payload.ifsc.trim(),
            payload.swift.trim(),
            payload.bank_ad_code.trim(),
            payload.lut_arn_no.trim(),
            payload.lut_arn_date.trim(),
            payload.place.trim(),
            payload.signatory_name.trim(),
            payload.fiscal_year.trim(),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn logic_save_company_logo(
    conn: &Connection,
    base64: &str,
    acting_role: &str,
    permissions: &[String],
    session_user_id: Option<i64>,
) -> Result<(), String> {
    if acting_role != "admin" && !permissions.iter().any(|p| p == "access_settings") {
        log_security_event(
            conn,
            "save_company_logo",
            session_user_id,
            "ERR_PERMISSION: access_settings not granted",
        );
        return Err("ERR_PERMISSION: access_settings not granted".into());
    }

    conn.execute(
        "UPDATE company_settings SET company_logo_base64=?1, updated_at=datetime('now') WHERE id=1",
        [base64],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn save_company_settings(
    db: State<'_, AppDb>,
    session: State<'_, AuthSession>,
    payload: SettingsPayload,
) -> Result<(), String> {
    let sess = session.get()?;
    db.with_conn(|conn| {
        logic_save_company_settings(conn, &payload, &sess.role, &sess.permissions, Some(sess.user_id))
    })
}

#[tauri::command]
pub fn save_company_logo(
    db: State<'_, AppDb>,
    session: State<'_, AuthSession>,
    base64: String,
) -> Result<(), String> {
    let sess = session.get()?;
    db.with_conn(|conn| logic_save_company_logo(conn, &base64, &sess.role, &sess.permissions, Some(sess.user_id)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn create_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE company_settings (
                id                  INTEGER PRIMARY KEY,
                name                TEXT DEFAULT '',
                address             TEXT DEFAULT '',
                gstin               TEXT DEFAULT '',
                pan                 TEXT DEFAULT '',
                iec                 TEXT DEFAULT '',
                bank_name           TEXT DEFAULT '',
                bank_account        TEXT DEFAULT '',
                ifsc                TEXT DEFAULT '',
                swift               TEXT DEFAULT '',
                bank_ad_code        TEXT DEFAULT '',
                lut_arn_no          TEXT DEFAULT '',
                lut_arn_date        TEXT DEFAULT '',
                place               TEXT DEFAULT '',
                signatory_name      TEXT DEFAULT '',
                company_logo_base64 TEXT DEFAULT '',
                updated_at          TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE security_event_log (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                command     TEXT    NOT NULL,
                user_id     INTEGER NULL,
                reason      TEXT    NOT NULL,
                occurred_at TEXT    NOT NULL DEFAULT (datetime('now'))
            );
            INSERT INTO company_settings (id) VALUES (1);
        "#,
        )
        .unwrap();
        conn
    }

    fn minimal_payload() -> SettingsPayload {
        SettingsPayload {
            name: "Acme Exports".into(),
            address: "123 Trade St, Mumbai".into(),
            gstin: "27AAAAA0000A1Z5".into(),
            pan: "AAAAA0000A".into(),
            iec: "0000000000".into(),
            bank_name: "State Bank".into(),
            bank_account: "00000000000".into(),
            ifsc: "SBIN0000000".into(),
            swift: "SBININBB".into(),
            bank_ad_code: "12345".into(),
            lut_arn_no: "AD270123456789".into(),
            lut_arn_date: "2025-04-01".into(),
            place: "Mumbai".into(),
            signatory_name: "Jane Doe".into(),
        }
    }

    #[test]
    fn save_settings_denied_for_operator() {
        let conn = create_test_db();
        let err =
            logic_save_company_settings(&conn, &minimal_payload(), "operator", &[], None).unwrap_err();
        assert!(err.contains("ERR_PERMISSION:"), "got: {err}");
    }

    #[test]
    fn save_settings_denied_for_viewer() {
        let conn = create_test_db();
        let err =
            logic_save_company_settings(&conn, &minimal_payload(), "viewer", &[], None).unwrap_err();
        assert!(err.contains("ERR_PERMISSION:"), "got: {err}");
    }

    #[test]
    fn save_settings_succeeds_for_admin() {
        let conn = create_test_db();
        logic_save_company_settings(&conn, &minimal_payload(), "admin", &[], None).unwrap();
        let name: String = conn
            .query_row("SELECT name FROM company_settings WHERE id=1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(name, "Acme Exports");
    }

    #[test]
    fn save_settings_trims_whitespace() {
        let conn = create_test_db();
        let mut p = minimal_payload();
        p.name = "  Padded Name  ".into();
        logic_save_company_settings(&conn, &p, "admin", &[], None).unwrap();
        let name: String = conn
            .query_row("SELECT name FROM company_settings WHERE id=1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(name, "Padded Name");
    }

    #[test]
    fn save_logo_denied_for_operator() {
        let conn = create_test_db();
        let err = logic_save_company_logo(&conn, "data:image/png;base64,abc", "operator", &[], None)
            .unwrap_err();
        assert!(err.contains("ERR_PERMISSION:"), "got: {err}");
    }

    #[test]
    fn save_logo_denied_for_viewer() {
        let conn = create_test_db();
        let err =
            logic_save_company_logo(&conn, "data:image/png;base64,abc", "viewer", &[], None).unwrap_err();
        assert!(err.contains("ERR_PERMISSION:"), "got: {err}");
    }

    #[test]
    fn save_logo_succeeds_for_admin() {
        let conn = create_test_db();
        let b64 = "data:image/png;base64,iVBORw0KGgo=";
        logic_save_company_logo(&conn, b64, "admin", &[], None).unwrap();
        let stored: String = conn
            .query_row(
                "SELECT company_logo_base64 FROM company_settings WHERE id=1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(stored, b64);
    }

    #[test]
    fn save_logo_empty_string_clears_logo() {
        let conn = create_test_db();
        logic_save_company_logo(&conn, "data:image/png;base64,abc", "admin", &[], None).unwrap();
        logic_save_company_logo(&conn, "", "admin", &[], None).unwrap();
        let stored: String = conn
            .query_row(
                "SELECT company_logo_base64 FROM company_settings WHERE id=1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(stored, "");
    }
}
