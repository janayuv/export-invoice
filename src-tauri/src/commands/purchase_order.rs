use rusqlite::{Connection, OptionalExtension};
use tauri::State;

use crate::commands::auth::log_security_event;
use crate::db::state::{AppDb, AuthSession};

// ── payload types ─────────────────────────────────────────────────────────────

#[derive(Debug, serde::Deserialize)]
pub struct POItemPayload {
    pub sr_no: i64,
    pub part_number: String,
    pub sa_number: String,
    pub description: String,
    pub quantity: f64,
    pub unit: String,
    pub unit_price: f64,
    pub total_amount: f64,
}

/// Shared payload for create and update.
/// `po_number` is used by update; ignored by create (allocated from sequence).
#[derive(Debug, serde::Deserialize)]
pub struct POPayload {
    pub po_number: String,
    pub po_date: String,
    pub customer_id: Option<i64>,
    pub customer_name: String,
    pub customer_address: String,
    pub customer_po_no: String,
    pub delivery_date: String,
    pub delivery_address: String,
    pub port_of_discharge: String,
    pub final_destination: String,
    pub payment_terms: String,
    pub currency: String,
    pub exchange_rate: f64,
    pub notes: String,
    pub status: String,
    pub show_sa_number: bool,
    pub items: Vec<POItemPayload>,
}

// ── fiscal-year / sequence helpers ────────────────────────────────────────────

fn allocate_po_number(conn: &Connection, po_date: &str) -> Result<String, String> {
    let parts: Vec<&str> = po_date.splitn(3, '-').collect();
    if parts.len() < 2 {
        return Err(format!("Invalid PO date: {po_date}"));
    }
    let year: i64 = parts[0]
        .parse()
        .map_err(|_| format!("Invalid year in date: {po_date}"))?;
    let month: i64 = parts[1]
        .parse()
        .map_err(|_| format!("Invalid month in date: {po_date}"))?;
    let fy_start = if month >= 4 { year } else { year - 1 };
    let fy_label = format!("{}-{:02}", fy_start, (fy_start + 1) % 100);

    conn.execute(
        "INSERT OR IGNORE INTO po_sequence (year, last_number) VALUES (?1, 0)",
        [fy_start],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE po_sequence SET last_number = last_number + 1 WHERE year = ?1",
        [fy_start],
    )
    .map_err(|e| e.to_string())?;
    let seq: i64 = conn
        .query_row(
            "SELECT last_number FROM po_sequence WHERE year = ?1",
            [fy_start],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(format!("PO/{}/{}", seq, fy_label))
}

fn insert_po_item(conn: &Connection, po_id: i64, item: &POItemPayload) -> Result<(), String> {
    conn.execute(
        "INSERT INTO purchase_order_items \
         (po_id, sr_no, part_number, sa_number, description, \
          quantity, unit, unit_price, total_amount) \
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        rusqlite::params![
            po_id,
            item.sr_no,
            item.part_number,
            item.sa_number,
            item.description,
            item.quantity,
            item.unit,
            item.unit_price,
            item.total_amount,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ── logic functions ───────────────────────────────────────────────────────────

pub fn logic_create_purchase_order(
    conn: &Connection,
    payload: &POPayload,
    created_by: Option<i64>,
    acting_role: &str,
    session_user_id: Option<i64>,
) -> Result<i64, String> {
    if acting_role != "admin" && acting_role != "operator" {
        log_security_event(conn, "create_purchase_order", session_user_id,
            "Permission denied: create_purchase_order requires admin or operator role");
        return Err(
            "Permission denied: create_purchase_order requires admin or operator role".into(),
        );
    }

    conn.execute_batch("BEGIN IMMEDIATE")
        .map_err(|e| e.to_string())?;

    let result = (|| -> Result<i64, String> {
        let po_number = allocate_po_number(conn, &payload.po_date)?;

        conn.execute(
            "INSERT INTO purchase_orders (
                po_number, po_date, customer_id, customer_name, customer_address,
                customer_po_no, delivery_date, delivery_address,
                port_of_discharge, final_destination,
                payment_terms, currency, exchange_rate, notes, status,
                created_by, show_sa_number
             ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)",
            rusqlite::params![
                po_number,
                payload.po_date,
                payload.customer_id,
                payload.customer_name,
                payload.customer_address,
                payload.customer_po_no,
                payload.delivery_date,
                payload.delivery_address,
                payload.port_of_discharge,
                payload.final_destination,
                payload.payment_terms,
                payload.currency,
                payload.exchange_rate,
                payload.notes,
                payload.status,
                created_by,
                payload.show_sa_number,
            ],
        )
        .map_err(|e| e.to_string())?;

        let po_id = conn.last_insert_rowid();

        for item in &payload.items {
            insert_po_item(conn, po_id, item)?;
        }

        Ok(po_id)
    })();

    match result {
        Ok(id) => {
            conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
            Ok(id)
        }
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(e)
        }
    }
}

pub fn logic_update_purchase_order(
    conn: &Connection,
    id: i64,
    payload: &POPayload,
    acting_role: &str,
    session_user_id: Option<i64>,
) -> Result<(), String> {
    let current_status: Option<String> = conn
        .query_row(
            "SELECT status FROM purchase_orders WHERE id=?1",
            [id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let current_status = current_status.ok_or_else(|| format!("PO {id} not found"))?;

    match acting_role {
        "admin" => {}
        "operator" => {
            if current_status != "draft" {
                log_security_event(conn, "update_purchase_order", session_user_id,
                    "Permission denied: operator cannot edit a non-draft purchase order");
                return Err(format!(
                    "Permission denied: operator cannot edit a {current_status} purchase order"
                ));
            }
        }
        _ => {
            log_security_event(conn, "update_purchase_order", session_user_id,
                "Permission denied: update_purchase_order requires admin or operator");
            return Err(
                "Permission denied: update_purchase_order requires admin or operator".into(),
            )
        }
    }

    conn.execute_batch("BEGIN IMMEDIATE")
        .map_err(|e| e.to_string())?;

    let result = (|| -> Result<(), String> {
        conn.execute(
            "UPDATE purchase_orders SET
                po_number=?1, po_date=?2, customer_id=?3, customer_name=?4,
                customer_address=?5, customer_po_no=?6, delivery_date=?7,
                delivery_address=?8, port_of_discharge=?9, final_destination=?10,
                payment_terms=?11, currency=?12, exchange_rate=?13, notes=?14,
                status=?15, show_sa_number=?16, updated_at=datetime('now')
             WHERE id=?17",
            rusqlite::params![
                payload.po_number,
                payload.po_date,
                payload.customer_id,
                payload.customer_name,
                payload.customer_address,
                payload.customer_po_no,
                payload.delivery_date,
                payload.delivery_address,
                payload.port_of_discharge,
                payload.final_destination,
                payload.payment_terms,
                payload.currency,
                payload.exchange_rate,
                payload.notes,
                payload.status,
                payload.show_sa_number,
                id,
            ],
        )
        .map_err(|e| e.to_string())?;

        conn.execute("DELETE FROM purchase_order_items WHERE po_id=?1", [id])
            .map_err(|e| e.to_string())?;

        for item in &payload.items {
            insert_po_item(conn, id, item)?;
        }

        Ok(())
    })();

    match result {
        Ok(()) => {
            conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
            Ok(())
        }
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(e)
        }
    }
}

pub fn logic_delete_purchase_order(
    conn: &Connection,
    id: i64,
    acting_role: &str,
    session_user_id: Option<i64>,
) -> Result<(), String> {
    if acting_role != "admin" {
        log_security_event(conn, "delete_purchase_order", session_user_id,
            "Permission denied: delete_purchase_order requires admin role");
        return Err("Permission denied: delete_purchase_order requires admin role".into());
    }
    conn.execute("DELETE FROM purchase_orders WHERE id=?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn logic_set_po_status(
    conn: &Connection,
    id: i64,
    new_status: &str,
    acting_role: &str,
    session_user_id: Option<i64>,
) -> Result<(), String> {
    // Transitions to confirmed/closed are admin-only.
    match new_status {
        "confirmed" | "closed" => {
            if acting_role != "admin" {
                log_security_event(conn, "set_po_status", session_user_id,
                    "Permission denied: setting PO status to confirmed/closed requires admin role");
                return Err(format!(
                    "Permission denied: setting PO status to '{new_status}' requires admin role"
                ));
            }
        }
        _ => {
            if acting_role != "admin" && acting_role != "operator" {
                log_security_event(conn, "set_po_status", session_user_id,
                    "Permission denied: set_po_status requires admin or operator");
                return Err(
                    "Permission denied: set_po_status requires admin or operator".into(),
                );
            }
        }
    }

    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM purchase_orders WHERE id=?1",
            [id],
            |r| r.get::<_, i64>(0),
        )
        .map(|c| c > 0)
        .map_err(|e| e.to_string())?;

    if !exists {
        return Err(format!("PO {id} not found"));
    }

    conn.execute(
        "UPDATE purchase_orders SET status=?1, updated_at=datetime('now') WHERE id=?2",
        rusqlite::params![new_status, id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

// ── Tauri commands ────────────────────────────────────────────────────────────
// Role and identity are read from the server-side AuthSession — they are never
// accepted from the frontend IPC payload.

#[tauri::command]
pub fn create_purchase_order(
    db: State<'_, AppDb>,
    session: State<'_, AuthSession>,
    payload: POPayload,
) -> Result<i64, String> {
    let sess = session.get()?;
    db.with_conn(|conn| logic_create_purchase_order(conn, &payload, Some(sess.user_id), &sess.role, Some(sess.user_id)))
}

#[tauri::command]
pub fn update_purchase_order(
    db: State<'_, AppDb>,
    session: State<'_, AuthSession>,
    id: i64,
    payload: POPayload,
) -> Result<(), String> {
    let sess = session.get()?;
    db.with_conn(|conn| logic_update_purchase_order(conn, id, &payload, &sess.role, Some(sess.user_id)))
}

#[tauri::command]
pub fn delete_purchase_order(
    db: State<'_, AppDb>,
    session: State<'_, AuthSession>,
    id: i64,
) -> Result<(), String> {
    let sess = session.get()?;
    db.with_conn(|conn| logic_delete_purchase_order(conn, id, &sess.role, Some(sess.user_id)))
}

#[tauri::command]
pub fn set_po_status(
    db: State<'_, AppDb>,
    session: State<'_, AuthSession>,
    id: i64,
    new_status: String,
) -> Result<(), String> {
    let sess = session.get()?;
    db.with_conn(|conn| logic_set_po_status(conn, id, &new_status, &sess.role, Some(sess.user_id)))
}
