use rusqlite::Connection;
use tauri::State;

use crate::commands::admin::{log_activity, ACT_CREATE_ENTRY, ACT_DELETE_ENTRY, ACT_UPDATE_ENTRY};
use crate::commands::auth::log_security_event;
use crate::db::state::{AppDb, AuthSession};

// ── payload types ─────────────────────────────────────────────────────────────

#[derive(Debug, serde::Deserialize)]
pub struct EntryItemPayload {
    pub part_number:  String,
    pub description:  String,
    pub quantity:     f64,
    pub unit:         String,
    pub unit_price:   f64,
    pub total_amount: f64,
}

#[derive(Debug, serde::Deserialize)]
pub struct EntryPayload {
    pub customer_id:        Option<i64>,
    pub invoice_id:         Option<i64>,
    pub purchase_order_id:  Option<i64>,
    pub customer_name:      String,
    pub customer_address:   String,
    pub invoice_number:     String,
    pub invoice_date:       String,
    pub po_number:          String,
    pub po_date:            String,
    pub customer_po_no:     String,
    pub currency:           String,
    pub exchange_rate:      f64,
    pub items:              Vec<EntryItemPayload>,
    pub local_invoice_no:   String,
    pub local_invoice_date: String,
    pub shipping_bill_no:   String,
    pub shipping_bill_date: String,
    pub bl_awb_no:          String,
    pub bl_awb_date:        String,
    pub status:             String,
}

// ── link validation ───────────────────────────────────────────────────────────

/// Verify all FK links exist and that invoice↔customer↔PO are consistent.
/// Called by both create and update before any INSERT/UPDATE.
fn validate_entry_links(conn: &Connection, payload: &EntryPayload) -> Result<(), String> {
    use rusqlite::OptionalExtension;

    if let Some(cid) = payload.customer_id {
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM customers WHERE id=?1",
                [cid],
                |r| r.get::<_, i64>(0),
            )
            .map(|c| c > 0)
            .map_err(|e| e.to_string())?;
        if !exists {
            return Err("Selected customer no longer exists.".into());
        }
    }

    let mut invoice_linked_po: Option<i64> = None;
    if let Some(iid) = payload.invoice_id {
        // Outer Option: row found or not. Inner Option: the nullable column.
        let row: Option<Option<i64>> = conn
            .query_row(
                "SELECT purchase_order_id FROM invoices WHERE id=?1",
                [iid],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;

        let po_id: Option<i64> = row.ok_or_else(|| "Selected invoice no longer exists.".to_string())?;
        invoice_linked_po = po_id;

        // The invoice's linked PO must belong to the selected customer.
        if let (Some(cid), Some(linked_po)) = (payload.customer_id, po_id) {
            let po_customer: Option<i64> = conn
                .query_row(
                    "SELECT customer_id FROM purchase_orders WHERE id=?1",
                    [linked_po],
                    |r| r.get(0),
                )
                .optional()
                .map_err(|e| e.to_string())?
                .flatten();
            if let Some(pc) = po_customer {
                if pc != cid {
                    return Err(
                        "Selected invoice does not belong to the selected customer.".into(),
                    );
                }
            }
        }
    }

    if let Some(poid) = payload.purchase_order_id {
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM purchase_orders WHERE id=?1",
                [poid],
                |r| r.get::<_, i64>(0),
            )
            .map(|c| c > 0)
            .map_err(|e| e.to_string())?;
        if !exists {
            return Err("Selected purchase order no longer exists.".into());
        }

        // When both invoice and PO are provided, they must agree.
        if payload.invoice_id.is_some() && invoice_linked_po != Some(poid) {
            return Err(
                "Selected purchase order does not match the purchase order \
                 linked to the selected invoice."
                    .into(),
            );
        }
    }

    Ok(())
}

// ── total recompute ───────────────────────────────────────────────────────────

/// Authoritative invoice_total: sum of per-item total_amounts, rounded to 2dp.
/// Prevents form-value drift — the form may submit a stale total.
fn recompute_total(items: &[EntryItemPayload]) -> f64 {
    let raw: f64 = items.iter().map(|i| i.total_amount).sum();
    (raw * 100.0).round() / 100.0
}

/// Serialize items to a compact JSON array matching the TS EntryItem shape.
fn serialize_items(items: &[EntryItemPayload]) -> Result<String, String> {
    let arr: Vec<serde_json::Value> = items
        .iter()
        .map(|i| {
            serde_json::json!({
                "part_number":  i.part_number,
                "description":  i.description,
                "quantity":     i.quantity,
                "unit":         i.unit,
                "unit_price":   i.unit_price,
                "total_amount": i.total_amount,
            })
        })
        .collect();
    serde_json::to_string(&arr).map_err(|e| e.to_string())
}

// ── logic functions ───────────────────────────────────────────────────────────

pub fn logic_create_entry(
    conn: &Connection,
    payload: &EntryPayload,
    created_by: Option<i64>,
    acting_role: &str,
    session_user_id: Option<i64>,
) -> Result<i64, String> {
    if acting_role != "admin" && acting_role != "operator" {
        log_security_event(
            conn, "create_entry", session_user_id,
            "ERR_PERMISSION: create_entry requires admin or operator role",
        );
        return Err("ERR_PERMISSION: create_entry requires admin or operator role".into());
    }

    validate_entry_links(conn, payload)?;

    let invoice_total = recompute_total(&payload.items);
    let items_json = serialize_items(&payload.items)?;

    conn.execute(
        "INSERT INTO entries (
            customer_id, invoice_id, purchase_order_id,
            customer_name, customer_address, invoice_number, invoice_date,
            po_number, po_date, customer_po_no,
            currency, exchange_rate, invoice_total, items,
            local_invoice_no, local_invoice_date,
            shipping_bill_no, shipping_bill_date,
            bl_awb_no, bl_awb_date,
            status, created_by
         ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22)",
        rusqlite::params![
            payload.customer_id, payload.invoice_id, payload.purchase_order_id,
            payload.customer_name, payload.customer_address,
            payload.invoice_number, payload.invoice_date,
            payload.po_number, payload.po_date, payload.customer_po_no,
            payload.currency, payload.exchange_rate, invoice_total, items_json,
            payload.local_invoice_no, payload.local_invoice_date,
            payload.shipping_bill_no, payload.shipping_bill_date,
            payload.bl_awb_no, payload.bl_awb_date,
            payload.status, created_by,
        ],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    log_activity(conn, session_user_id, "", ACT_CREATE_ENTRY, "entries", &payload.invoice_number);
    Ok(id)
}

pub fn logic_update_entry(
    conn: &Connection,
    id: i64,
    payload: &EntryPayload,
    expected_row_version: i64,
    acting_role: &str,
    session_user_id: Option<i64>,
) -> Result<(), String> {
    if acting_role != "admin" && acting_role != "operator" {
        log_security_event(
            conn, "update_entry", session_user_id,
            "ERR_PERMISSION: update_entry requires admin or operator role",
        );
        return Err("ERR_PERMISSION: update_entry requires admin or operator role".into());
    }

    // Verify existence first so "not found" is distinct from CONFLICT.
    let exists: bool = conn
        .query_row("SELECT COUNT(*) FROM entries WHERE id=?1", [id], |r| r.get::<_, i64>(0))
        .map(|c| c > 0)
        .map_err(|e| e.to_string())?;
    if !exists {
        return Err(format!("Entry {id} not found"));
    }

    validate_entry_links(conn, payload)?;

    let invoice_total = recompute_total(&payload.items);
    let items_json = serialize_items(&payload.items)?;

    let rows = conn
        .execute(
            "UPDATE entries SET
                customer_id=?1, invoice_id=?2, purchase_order_id=?3,
                customer_name=?4, customer_address=?5,
                invoice_number=?6, invoice_date=?7,
                po_number=?8, po_date=?9, customer_po_no=?10,
                currency=?11, exchange_rate=?12, invoice_total=?13, items=?14,
                local_invoice_no=?15, local_invoice_date=?16,
                shipping_bill_no=?17, shipping_bill_date=?18,
                bl_awb_no=?19, bl_awb_date=?20,
                status=?21, row_version=row_version+1, updated_at=datetime('now')
             WHERE id=?22 AND row_version=?23",
            rusqlite::params![
                payload.customer_id, payload.invoice_id, payload.purchase_order_id,
                payload.customer_name, payload.customer_address,
                payload.invoice_number, payload.invoice_date,
                payload.po_number, payload.po_date, payload.customer_po_no,
                payload.currency, payload.exchange_rate, invoice_total, items_json,
                payload.local_invoice_no, payload.local_invoice_date,
                payload.shipping_bill_no, payload.shipping_bill_date,
                payload.bl_awb_no, payload.bl_awb_date,
                payload.status, id, expected_row_version,
            ],
        )
        .map_err(|e| e.to_string())?;

    if rows == 0 {
        return Err(format!("ERR_CONFLICT: entry {id} was modified by another session"));
    }
    log_activity(conn, session_user_id, "", ACT_UPDATE_ENTRY, "entries", &payload.invoice_number);
    Ok(())
}

pub fn logic_delete_entry(
    conn: &Connection,
    id: i64,
    acting_role: &str,
    session_user_id: Option<i64>,
) -> Result<(), String> {
    if acting_role != "admin" {
        log_security_event(
            conn, "delete_entry", session_user_id,
            "ERR_PERMISSION: delete_entry requires admin role",
        );
        return Err("ERR_PERMISSION: delete_entry requires admin role".into());
    }

    let inv_no: String = conn
        .query_row("SELECT invoice_number FROM entries WHERE id=?1", [id], |r| r.get(0))
        .unwrap_or_default();
    conn.execute("DELETE FROM entries WHERE id=?1", [id])
        .map_err(|e| e.to_string())?;
    log_activity(conn, session_user_id, "", ACT_DELETE_ENTRY, "entries", &inv_no);
    Ok(())
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn create_entry(
    db: State<'_, AppDb>,
    session: State<'_, AuthSession>,
    payload: EntryPayload,
    created_by: Option<i64>,
) -> Result<i64, String> {
    let sess = session.get()?;
    db.with_conn(|conn| {
        logic_create_entry(conn, &payload, created_by, &sess.role, Some(sess.user_id))
    })
}

#[tauri::command]
pub fn update_entry(
    db: State<'_, AppDb>,
    session: State<'_, AuthSession>,
    id: i64,
    expected_row_version: i64,
    payload: EntryPayload,
) -> Result<(), String> {
    let sess = session.get()?;
    db.with_conn(|conn| logic_update_entry(conn, id, &payload, expected_row_version, &sess.role, Some(sess.user_id)))
}

#[tauri::command]
pub fn delete_entry(
    db: State<'_, AppDb>,
    session: State<'_, AuthSession>,
    id: i64,
) -> Result<(), String> {
    let sess = session.get()?;
    db.with_conn(|conn| logic_delete_entry(conn, id, &sess.role, Some(sess.user_id)))
}

// ── tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn create_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        conn.execute_batch(r#"
            CREATE TABLE customers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                updated_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE purchase_orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                po_number TEXT NOT NULL DEFAULT '',
                po_date TEXT NOT NULL DEFAULT '',
                customer_id INTEGER REFERENCES customers(id),
                status TEXT DEFAULT 'draft'
            );
            CREATE TABLE invoices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                invoice_number TEXT NOT NULL UNIQUE,
                invoice_date TEXT NOT NULL DEFAULT '',
                purchase_order_id INTEGER REFERENCES purchase_orders(id),
                status TEXT DEFAULT 'draft'
            );
            CREATE TABLE security_event_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                command TEXT NOT NULL,
                user_id INTEGER NULL,
                reason TEXT NOT NULL,
                occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id INTEGER REFERENCES customers(id),
                invoice_id INTEGER REFERENCES invoices(id),
                purchase_order_id INTEGER REFERENCES purchase_orders(id),
                customer_name TEXT NOT NULL DEFAULT '',
                customer_address TEXT NOT NULL DEFAULT '',
                invoice_number TEXT NOT NULL DEFAULT '',
                invoice_date TEXT NOT NULL DEFAULT '',
                po_number TEXT NOT NULL DEFAULT '',
                po_date TEXT NOT NULL DEFAULT '',
                customer_po_no TEXT NOT NULL DEFAULT '',
                currency TEXT NOT NULL DEFAULT 'USD',
                exchange_rate REAL NOT NULL DEFAULT 1.0,
                invoice_total REAL NOT NULL DEFAULT 0.0,
                items TEXT NOT NULL DEFAULT '[]',
                local_invoice_no TEXT NOT NULL DEFAULT '',
                local_invoice_date TEXT NOT NULL DEFAULT '',
                shipping_bill_no TEXT NOT NULL DEFAULT '',
                shipping_bill_date TEXT NOT NULL DEFAULT '',
                bl_awb_no TEXT NOT NULL DEFAULT '',
                bl_awb_date TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'draft'
                    CHECK(status IN ('draft','final')),
                created_by INTEGER NULL,
                row_version INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
        "#).unwrap();
        conn
    }

    fn minimal_payload() -> EntryPayload {
        EntryPayload {
            customer_id: None, invoice_id: None, purchase_order_id: None,
            customer_name: "Test Co".into(), customer_address: "".into(),
            invoice_number: "EXP/1/2025-26".into(), invoice_date: "2025-06-01".into(),
            po_number: "".into(), po_date: "".into(), customer_po_no: "".into(),
            currency: "USD".into(), exchange_rate: 84.0,
            items: vec![EntryItemPayload {
                part_number: "P1".into(), description: "Widget".into(),
                quantity: 2.0, unit: "NOS".into(), unit_price: 10.0, total_amount: 20.0,
            }],
            local_invoice_no: "LI-001".into(), local_invoice_date: "2025-06-02".into(),
            shipping_bill_no: "SB-001".into(), shipping_bill_date: "2025-06-03".into(),
            bl_awb_no: "".into(), bl_awb_date: "".into(),
            status: "draft".into(),
        }
    }

    // ── RBAC ────────────────────────────────────────────────────────────────

    #[test]
    fn create_denied_for_viewer() {
        let conn = create_test_db();
        let err = logic_create_entry(&conn, &minimal_payload(), None, "viewer", None).unwrap_err();
        assert!(err.contains("ERR_PERMISSION:"), "got: {err}");
    }

    #[test]
    fn update_denied_for_viewer() {
        let conn = create_test_db();
        let err = logic_update_entry(&conn, 1, &minimal_payload(), 1, "viewer", None).unwrap_err();
        assert!(err.contains("ERR_PERMISSION:"), "got: {err}");
    }

    #[test]
    fn delete_denied_for_operator() {
        let conn = create_test_db();
        let err = logic_delete_entry(&conn, 1, "operator", None).unwrap_err();
        assert!(err.contains("ERR_PERMISSION:"), "got: {err}");
    }

    #[test]
    fn delete_denied_for_viewer() {
        let conn = create_test_db();
        let err = logic_delete_entry(&conn, 1, "viewer", None).unwrap_err();
        assert!(err.contains("ERR_PERMISSION:"), "got: {err}");
    }

    // ── happy paths ─────────────────────────────────────────────────────────

    #[test]
    fn create_succeeds_for_admin() {
        let conn = create_test_db();
        let id = logic_create_entry(&conn, &minimal_payload(), None, "admin", None).unwrap();
        assert!(id > 0);
    }

    #[test]
    fn create_succeeds_for_operator() {
        let conn = create_test_db();
        let id = logic_create_entry(&conn, &minimal_payload(), None, "operator", None).unwrap();
        assert!(id > 0);
    }

    #[test]
    fn update_succeeds_for_existing_entry() {
        let conn = create_test_db();
        let id = logic_create_entry(&conn, &minimal_payload(), None, "admin", None).unwrap();
        let mut p = minimal_payload();
        p.local_invoice_no = "LI-999".into();
        logic_update_entry(&conn, id, &p, 1, "admin", None).unwrap();
        let stored: String = conn
            .query_row(
                "SELECT local_invoice_no FROM entries WHERE id=?1", [id], |r| r.get(0)
            )
            .unwrap();
        assert_eq!(stored, "LI-999");
    }

    #[test]
    fn delete_removes_entry() {
        let conn = create_test_db();
        let id = logic_create_entry(&conn, &minimal_payload(), None, "admin", None).unwrap();
        logic_delete_entry(&conn, id, "admin", None).unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM entries WHERE id=?1", [id], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    // ── invoice_total recompute ──────────────────────────────────────────────

    #[test]
    fn total_is_sum_of_item_total_amounts() {
        let conn = create_test_db();
        let mut p = minimal_payload();
        p.items = vec![
            EntryItemPayload {
                part_number: "A".into(), description: "".into(),
                quantity: 1.0, unit: "NOS".into(), unit_price: 15.0, total_amount: 15.0,
            },
            EntryItemPayload {
                part_number: "B".into(), description: "".into(),
                quantity: 3.0, unit: "NOS".into(), unit_price: 5.0, total_amount: 15.0,
            },
        ];
        let id = logic_create_entry(&conn, &p, None, "admin", None).unwrap();
        let stored: f64 = conn
            .query_row("SELECT invoice_total FROM entries WHERE id=?1", [id], |r| r.get(0))
            .unwrap();
        assert_eq!(stored, 30.0);
    }

    // ── link validation ──────────────────────────────────────────────────────

    #[test]
    fn create_rejects_missing_customer() {
        let conn = create_test_db();
        let mut p = minimal_payload();
        p.customer_id = Some(9999);
        let err = logic_create_entry(&conn, &p, None, "admin", None).unwrap_err();
        assert!(err.contains("customer"), "got: {err}");
    }

    #[test]
    fn create_rejects_missing_invoice() {
        let conn = create_test_db();
        let mut p = minimal_payload();
        p.invoice_id = Some(9999);
        let err = logic_create_entry(&conn, &p, None, "admin", None).unwrap_err();
        assert!(err.contains("invoice"), "got: {err}");
    }

    #[test]
    fn create_rejects_missing_po() {
        let conn = create_test_db();
        let mut p = minimal_payload();
        p.purchase_order_id = Some(9999);
        let err = logic_create_entry(&conn, &p, None, "admin", None).unwrap_err();
        assert!(err.contains("purchase order"), "got: {err}");
    }

    #[test]
    fn create_rejects_invoice_belonging_to_wrong_customer() {
        let conn = create_test_db();
        conn.execute("INSERT INTO customers (name) VALUES ('Cust1')", []).unwrap();
        let c1: i64 = conn.last_insert_rowid();
        conn.execute("INSERT INTO customers (name) VALUES ('Cust2')", []).unwrap();
        let c2: i64 = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO purchase_orders (po_number, po_date, customer_id) VALUES ('PO/1/2025-26','2025-06-01',?1)",
            [c2],
        ).unwrap();
        let po_id: i64 = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO invoices (invoice_number, invoice_date, purchase_order_id) VALUES ('EXP/1/2025-26','2025-06-01',?1)",
            [po_id],
        ).unwrap();
        let inv_id: i64 = conn.last_insert_rowid();

        let mut p = minimal_payload();
        p.customer_id = Some(c1);
        p.invoice_id  = Some(inv_id);
        let err = logic_create_entry(&conn, &p, None, "admin", None).unwrap_err();
        assert!(err.contains("does not belong"), "got: {err}");
    }

    #[test]
    fn create_rejects_mismatched_po_and_invoice() {
        let conn = create_test_db();
        conn.execute(
            "INSERT INTO purchase_orders (po_number, po_date) VALUES ('PO/1/2025-26','2025-06-01')",
            [],
        ).unwrap();
        let po_a: i64 = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO purchase_orders (po_number, po_date) VALUES ('PO/2/2025-26','2025-06-01')",
            [],
        ).unwrap();
        let po_b: i64 = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO invoices (invoice_number, invoice_date, purchase_order_id) VALUES ('EXP/1/2025-26','2025-06-01',?1)",
            [po_a],
        ).unwrap();
        let inv_id: i64 = conn.last_insert_rowid();

        let mut p = minimal_payload();
        p.invoice_id = Some(inv_id);
        p.purchase_order_id = Some(po_b);
        let err = logic_create_entry(&conn, &p, None, "admin", None).unwrap_err();
        assert!(err.contains("does not match"), "got: {err}");
    }

    #[test]
    fn update_returns_err_for_nonexistent_entry() {
        let conn = create_test_db();
        let err = logic_update_entry(&conn, 9999, &minimal_payload(), 1, "admin", None).unwrap_err();
        assert!(err.contains("not found"), "got: {err}");
    }

    #[test]
    fn items_stored_as_valid_json() {
        let conn = create_test_db();
        let id = logic_create_entry(&conn, &minimal_payload(), None, "admin", None).unwrap();
        let raw: String = conn
            .query_row("SELECT items FROM entries WHERE id=?1", [id], |r| r.get(0))
            .unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&raw).unwrap();
        assert!(parsed.is_array());
        assert_eq!(parsed[0]["part_number"], "P1");
    }
}
