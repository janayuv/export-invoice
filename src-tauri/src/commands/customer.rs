use rusqlite::Connection;
use tauri::State;

use crate::commands::auth::log_security_event;
use crate::db::state::{AppDb, AuthSession};

// ── payload type ──────────────────────────────────────────────────────────────

#[derive(Debug, serde::Deserialize)]
pub struct CustomerPayload {
    pub name: String,
    pub address: String,
    pub country_of_destination: String,
    pub port_of_discharge: String,
    pub final_destination: String,
    pub currency: String,
    pub pre_carriage_by: String,
    pub place_of_receipt: String,
    pub pre_carrier: String,
    pub port_of_loading: String,
}

// ── logic functions ───────────────────────────────────────────────────────────

fn unique_constraint_err(e: rusqlite::Error, name: &str) -> String {
    if e.to_string().contains("UNIQUE constraint failed") {
        format!("A customer named \"{name}\" already exists.")
    } else {
        e.to_string()
    }
}

pub fn logic_create_customer(
    conn: &Connection,
    payload: &CustomerPayload,
    acting_role: &str,
    session_user_id: Option<i64>,
) -> Result<i64, String> {
    if acting_role != "admin" && acting_role != "operator" {
        log_security_event(conn, "create_customer", session_user_id,
            "Permission denied: create_customer requires admin or operator role");
        return Err(
            "Permission denied: create_customer requires admin or operator role".into(),
        );
    }
    conn.execute(
        "INSERT INTO customers (
            name, address, country_of_destination, port_of_discharge, final_destination,
            currency, pre_carriage_by, place_of_receipt, pre_carrier, port_of_loading
         ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
        rusqlite::params![
            payload.name.trim(),
            payload.address.trim(),
            payload.country_of_destination.trim(),
            payload.port_of_discharge.trim(),
            payload.final_destination.trim(),
            payload.currency.trim(),
            payload.pre_carriage_by.trim(),
            payload.place_of_receipt.trim(),
            payload.pre_carrier.trim(),
            payload.port_of_loading.trim(),
        ],
    )
    .map_err(|e| unique_constraint_err(e, payload.name.trim()))?;
    Ok(conn.last_insert_rowid())
}

pub fn logic_update_customer(
    conn: &Connection,
    id: i64,
    payload: &CustomerPayload,
    acting_role: &str,
    session_user_id: Option<i64>,
) -> Result<(), String> {
    if acting_role != "admin" && acting_role != "operator" {
        log_security_event(conn, "update_customer", session_user_id,
            "Permission denied: update_customer requires admin or operator role");
        return Err(
            "Permission denied: update_customer requires admin or operator role".into(),
        );
    }
    // Historical snapshots in purchase_orders/invoices/entries are intentionally not updated.
    conn.execute(
        "UPDATE customers SET
            name=?1, address=?2, country_of_destination=?3, port_of_discharge=?4,
            final_destination=?5, currency=?6, pre_carriage_by=?7, place_of_receipt=?8,
            pre_carrier=?9, port_of_loading=?10, updated_at=datetime('now')
         WHERE id=?11",
        rusqlite::params![
            payload.name.trim(),
            payload.address.trim(),
            payload.country_of_destination.trim(),
            payload.port_of_discharge.trim(),
            payload.final_destination.trim(),
            payload.currency.trim(),
            payload.pre_carriage_by.trim(),
            payload.place_of_receipt.trim(),
            payload.pre_carrier.trim(),
            payload.port_of_loading.trim(),
            id,
        ],
    )
    .map_err(|e| unique_constraint_err(e, payload.name.trim()))?;
    Ok(())
}

pub fn logic_delete_customer(
    conn: &Connection,
    id: i64,
    acting_role: &str,
    session_user_id: Option<i64>,
) -> Result<(), String> {
    if acting_role != "admin" {
        log_security_event(conn, "delete_customer", session_user_id,
            "Permission denied: delete_customer requires admin role");
        return Err("Permission denied: delete_customer requires admin role".into());
    }

    let po_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM purchase_orders WHERE customer_id=?1",
            [id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    let inv_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM invoices i \
             JOIN purchase_orders po ON i.purchase_order_id = po.id \
             WHERE po.customer_id=?1",
            [id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    let entry_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM entries WHERE customer_id=?1",
            [id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    if po_count > 0 || inv_count > 0 || entry_count > 0 {
        return Err(format!(
            "Cannot delete: customer has {} purchase order(s), {} invoice(s), {} entry(ies).",
            po_count, inv_count, entry_count
        ));
    }

    conn.execute("DELETE FROM customers WHERE id=?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Tauri commands ────────────────────────────────────────────────────────────
// Role is read from the server-side AuthSession — not accepted from IPC.

#[tauri::command]
pub fn create_customer(
    db: State<'_, AppDb>,
    session: State<'_, AuthSession>,
    payload: CustomerPayload,
) -> Result<i64, String> {
    let sess = session.get()?;
    db.with_conn(|conn| logic_create_customer(conn, &payload, &sess.role, Some(sess.user_id)))
}

#[tauri::command]
pub fn update_customer(
    db: State<'_, AppDb>,
    session: State<'_, AuthSession>,
    id: i64,
    payload: CustomerPayload,
) -> Result<(), String> {
    let sess = session.get()?;
    db.with_conn(|conn| logic_update_customer(conn, id, &payload, &sess.role, Some(sess.user_id)))
}

#[tauri::command]
pub fn delete_customer(
    db: State<'_, AppDb>,
    session: State<'_, AuthSession>,
    id: i64,
) -> Result<(), String> {
    let sess = session.get()?;
    db.with_conn(|conn| logic_delete_customer(conn, id, &sess.role, Some(sess.user_id)))
}
