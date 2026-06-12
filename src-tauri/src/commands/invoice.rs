use rusqlite::{Connection, OptionalExtension};
use tauri::State;

use crate::commands::admin::{
    log_activity, ACT_CREATE_INVOICE, ACT_DELETE_INVOICE, ACT_FINALIZE_INVOICE, ACT_UPDATE_INVOICE,
};
use crate::commands::auth::log_security_event;
use crate::db::state::{AppDb, AuthSession};

// ── payload types ─────────────────────────────────────────────────────────────

#[derive(Debug, serde::Deserialize, serde::Serialize)]
pub struct PackingListItemPayload {
    pub sr_no: i64,
    pub marks_nos: String,
    pub no_of_pkgs: String,
    pub dimensions: String,
    pub dimensions_unit: String,
    pub net_weight: Option<String>,
    pub gross_weight: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
pub struct InvoiceItemPayload {
    pub sr_no: i64,
    pub marks_nos: String,
    pub no_of_pkgs: String,
    pub dimensions: String,
    pub dimensions_unit: String,
    pub part_number: String,
    pub sa_number: String,
    pub description: String,
    pub quantity: f64,
    pub unit: String,
    pub unit_price: f64,
    pub total_amount: f64,
}

/// Shared payload for create and update.
/// `invoice_number` is used by update; ignored by create (allocated from sequence).
#[derive(Debug, serde::Deserialize)]
pub struct InvoicePayload {
    pub invoice_number: String,
    pub invoice_date: String,
    pub transport_mode: String,
    pub buyer_order_no: String,
    pub duty_drawback: String,
    pub hs_code: String,
    pub other_references: String,
    pub consignee_name: String,
    pub consignee_address: String,
    pub buyer_if_other: String,
    pub country_of_origin: String,
    pub country_of_destination: String,
    pub pre_carriage_by: String,
    pub place_of_receipt: String,
    pub pre_carrier: String,
    pub vessel: String,
    pub port_of_loading: String,
    pub port_of_discharge: String,
    pub final_destination: String,
    pub terms_of_payment: String,
    pub incoterm: String,
    pub currency: String,
    pub exchange_rate: f64,
    pub net_weight: String,
    pub gross_weight: String,
    pub notes: String,
    pub status: String,
    pub show_sa_number: bool,
    pub purchase_order_id: Option<i64>,
    pub items: Vec<InvoiceItemPayload>,
    pub packing_list: Option<Vec<PackingListItemPayload>>,
}

// ── fiscal-year / sequence helpers ────────────────────────────────────────────

struct FiscalYear {
    start: i64,
    label: String,
}

fn fiscal_year(date: &str) -> Result<FiscalYear, String> {
    let parts: Vec<&str> = date.splitn(3, '-').collect();
    if parts.len() < 2 {
        return Err(format!("Invalid invoice date: {date}"));
    }
    let year: i64 = parts[0]
        .parse()
        .map_err(|_| format!("Invalid year in date: {date}"))?;
    let month: i64 = parts[1]
        .parse()
        .map_err(|_| format!("Invalid month in date: {date}"))?;
    let fy_start = if month >= 4 { year } else { year - 1 };
    // Mirrors JS: String(fyStart+1).slice(-2)
    let label = format!("{}-{:02}", fy_start, (fy_start + 1) % 100);
    Ok(FiscalYear { start: fy_start, label })
}

/// Atomically increments the fiscal-year counter and returns the allocated number.
/// Must be called inside an open transaction.
fn allocate_invoice_number(conn: &Connection, invoice_date: &str) -> Result<String, String> {
    // Use the configured fiscal year override if one is set; otherwise derive from date.
    let override_fy: String = conn
        .query_row(
            "SELECT COALESCE(fiscal_year, '') FROM company_settings WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or_default();

    let fy = if override_fy.trim().is_empty() {
        fiscal_year(invoice_date)?
    } else {
        let s = override_fy.trim();
        let parts: Vec<&str> = s.splitn(2, '-').collect();
        if parts.len() != 2 {
            return Err(format!("Invalid fiscal_year setting: {s}"));
        }
        let start: i64 = parts[0]
            .parse()
            .map_err(|_| format!("Invalid fiscal_year setting: {s}"))?;
        FiscalYear { start, label: s.to_string() }
    };

    conn.execute(
        "INSERT OR IGNORE INTO invoice_sequence (year, last_number) VALUES (?1, 0)",
        [fy.start],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE invoice_sequence SET last_number = last_number + 1 WHERE year = ?1",
        [fy.start],
    )
    .map_err(|e| e.to_string())?;
    let seq: i64 = conn
        .query_row(
            "SELECT last_number FROM invoice_sequence WHERE year = ?1",
            [fy.start],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(format!("EXP/{}/{}", seq, fy.label))
}

fn insert_item(conn: &Connection, invoice_id: i64, item: &InvoiceItemPayload) -> Result<(), String> {
    conn.execute(
        "INSERT INTO invoice_items (
            invoice_id, sr_no, marks_nos, no_of_pkgs, dimensions, dimensions_unit,
            part_number, sa_number, description, quantity, unit, unit_price, total_amount
         ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
        rusqlite::params![
            invoice_id, item.sr_no, item.marks_nos, item.no_of_pkgs,
            item.dimensions, item.dimensions_unit, item.part_number, item.sa_number,
            item.description, item.quantity, item.unit, item.unit_price, item.total_amount,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ── logic functions (pure &Connection, directly testable) ────────────────────

pub fn logic_create_invoice(
    conn: &Connection,
    payload: &InvoicePayload,
    created_by: Option<i64>,
    acting_role: &str,
    permissions: &[String],
    session_user_id: Option<i64>,
) -> Result<i64, String> {
    if acting_role != "admin" && !permissions.iter().any(|p| p == "create_invoice") {
        log_security_event(conn, "create_invoice", session_user_id,
            "ERR_PERMISSION: create_invoice not granted");
        return Err("ERR_PERMISSION: create_invoice not granted".into());
    }

    let descriptions: Vec<String> = payload.items.iter().map(|i| i.description.clone()).collect();
    crate::validation::validate_invoice_payload(
        &payload.invoice_number,
        &payload.notes,
        &payload.consignee_name,
        &payload.consignee_address,
        payload.items.len(),
        &descriptions,
    )?;

    let packing_list_json = serde_json::to_string(
        payload.packing_list.as_deref().unwrap_or(&[]),
    )
    .map_err(|e| e.to_string())?;

    conn.execute_batch("BEGIN IMMEDIATE")
        .map_err(|e| e.to_string())?;

    let result = (|| -> Result<(i64, String), String> {
        let invoice_number = allocate_invoice_number(conn, &payload.invoice_date)?;

        conn.execute(
            "INSERT INTO invoices (
                invoice_number, invoice_date, transport_mode, buyer_order_no,
                duty_drawback, hs_code, other_references, consignee_name,
                consignee_address, buyer_if_other, country_of_origin, country_of_destination,
                pre_carriage_by, place_of_receipt, pre_carrier, vessel,
                port_of_loading, port_of_discharge, final_destination, terms_of_payment,
                currency, exchange_rate, net_weight, gross_weight, notes, status,
                purchase_order_id, created_by, incoterm, packing_list, show_sa_number
             ) VALUES (
                ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,
                ?17,?18,?19,?20,?21,?22,?23,?24,?25,?26,?27,?28,?29,?30,?31
             )",
            rusqlite::params![
                invoice_number,
                payload.invoice_date, payload.transport_mode, payload.buyer_order_no,
                payload.duty_drawback, payload.hs_code, payload.other_references,
                payload.consignee_name, payload.consignee_address, payload.buyer_if_other,
                payload.country_of_origin, payload.country_of_destination,
                payload.pre_carriage_by, payload.place_of_receipt, payload.pre_carrier,
                payload.vessel, payload.port_of_loading, payload.port_of_discharge,
                payload.final_destination, payload.terms_of_payment,
                payload.currency, payload.exchange_rate,
                payload.net_weight, payload.gross_weight,
                payload.notes, payload.status,
                payload.purchase_order_id, created_by,
                payload.incoterm, packing_list_json, payload.show_sa_number,
            ],
        )
        .map_err(|e| e.to_string())?;

        let invoice_id = conn.last_insert_rowid();

        for item in &payload.items {
            insert_item(conn, invoice_id, item)?;
        }

        Ok((invoice_id, invoice_number))
    })();

    match result {
        Ok((id, invoice_number)) => {
            conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
            log_activity(conn, session_user_id, "", ACT_CREATE_INVOICE, "invoices", &invoice_number);
            Ok(id)
        }
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(e)
        }
    }
}

pub fn logic_update_invoice(
    conn: &Connection,
    id: i64,
    payload: &InvoicePayload,
    expected_row_version: i64,
    acting_role: &str,
    permissions: &[String],
    session_user_id: Option<i64>,
) -> Result<(), String> {
    // Enforce RBAC against the *current* status before making changes.
    let current_status: Option<String> = conn
        .query_row(
            "SELECT status FROM invoices WHERE id=?1",
            [id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let current_status = current_status
        .ok_or_else(|| format!("Invoice {id} not found"))?;

    if acting_role != "admin" {
        let required = if current_status == "final" { "edit_final_invoice" } else { "edit_invoice" };
        if !permissions.iter().any(|p| p == required) {
            log_security_event(conn, "update_invoice", session_user_id,
                &format!("ERR_PERMISSION: {required} not granted"));
            return Err(format!("ERR_PERMISSION: {required} not granted"));
        }
    }

    let descriptions: Vec<String> = payload.items.iter().map(|i| i.description.clone()).collect();
    crate::validation::validate_invoice_payload(
        &payload.invoice_number,
        &payload.notes,
        &payload.consignee_name,
        &payload.consignee_address,
        payload.items.len(),
        &descriptions,
    )?;

    let packing_list_json = serde_json::to_string(
        payload.packing_list.as_deref().unwrap_or(&[]),
    )
    .map_err(|e| e.to_string())?;

    conn.execute_batch("BEGIN IMMEDIATE")
        .map_err(|e| e.to_string())?;

    let result = (|| -> Result<(), String> {
        let rows = conn.execute(
            "UPDATE invoices SET
                invoice_number=?1, invoice_date=?2, transport_mode=?3, buyer_order_no=?4,
                duty_drawback=?5, hs_code=?6, other_references=?7, consignee_name=?8,
                consignee_address=?9, buyer_if_other=?10, country_of_origin=?11,
                country_of_destination=?12, pre_carriage_by=?13, place_of_receipt=?14,
                pre_carrier=?15, vessel=?16, port_of_loading=?17, port_of_discharge=?18,
                final_destination=?19, terms_of_payment=?20, currency=?21,
                exchange_rate=?22, net_weight=?23, gross_weight=?24, notes=?25,
                status=?26, purchase_order_id=?27, incoterm=?28, packing_list=?29,
                show_sa_number=?30, row_version=row_version+1, updated_at=datetime('now')
             WHERE id=?31 AND row_version=?32",
            rusqlite::params![
                payload.invoice_number, payload.invoice_date, payload.transport_mode,
                payload.buyer_order_no, payload.duty_drawback, payload.hs_code,
                payload.other_references, payload.consignee_name, payload.consignee_address,
                payload.buyer_if_other, payload.country_of_origin, payload.country_of_destination,
                payload.pre_carriage_by, payload.place_of_receipt, payload.pre_carrier,
                payload.vessel, payload.port_of_loading, payload.port_of_discharge,
                payload.final_destination, payload.terms_of_payment, payload.currency,
                payload.exchange_rate, payload.net_weight, payload.gross_weight,
                payload.notes, payload.status, payload.purchase_order_id,
                payload.incoterm, packing_list_json, payload.show_sa_number,
                id, expected_row_version,
            ],
        )
        .map_err(|e| e.to_string())?;

        if rows == 0 {
            return Err(format!("ERR_CONFLICT: invoice {id} was modified by another session"));
        }

        conn.execute("DELETE FROM invoice_items WHERE invoice_id=?1", [id])
            .map_err(|e| e.to_string())?;

        for item in &payload.items {
            insert_item(conn, id, item)?;
        }

        Ok(())
    })();

    match result {
        Ok(_) => {
            conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
            log_activity(conn, session_user_id, "", ACT_UPDATE_INVOICE, "invoices", &payload.invoice_number);
            Ok(())
        }
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(e)
        }
    }
}

pub fn logic_delete_invoice(conn: &Connection, id: i64, acting_role: &str, permissions: &[String], session_user_id: Option<i64>) -> Result<(), String> {
    if acting_role != "admin" && !permissions.iter().any(|p| p == "delete_invoice") {
        log_security_event(conn, "delete_invoice", session_user_id,
            "ERR_PERMISSION: delete_invoice not granted");
        return Err("ERR_PERMISSION: delete_invoice not granted".into());
    }

    let inv_no: Option<String> = conn
        .query_row(
            "SELECT invoice_number FROM invoices WHERE id=?1",
            [id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM invoices WHERE id=?1", [id])
        .map_err(|e| e.to_string())?;

    log_activity(conn, session_user_id, "", ACT_DELETE_INVOICE, "invoices",
        inv_no.as_deref().unwrap_or(""));

    // Recalculate the fiscal-year sequence so the next allocation continues from
    // the highest number still present, not the deleted one.
    if let Some(num) = inv_no {
        let parts: Vec<&str> = num.splitn(3, '/').collect();
        if parts.len() == 3 && parts[0] == "EXP" {
            let fy_label = parts[2];
            let fy_start: i64 = fy_label
                .split('-')
                .next()
                .and_then(|s| s.parse().ok())
                .unwrap_or(0);
            if fy_start > 0 {
                conn.execute(
                    "UPDATE invoice_sequence \
                     SET last_number = COALESCE( \
                       (SELECT MAX(CAST(SUBSTR(invoice_number,5, \
                                INSTR(SUBSTR(invoice_number,5),'/')-1) AS INTEGER)) \
                        FROM invoices \
                        WHERE invoice_number LIKE 'EXP/%/' || ?1), \
                       0) \
                     WHERE year = ?2",
                    rusqlite::params![fy_label, fy_start],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }

    Ok(())
}

pub fn logic_finalize_invoice(
    conn: &Connection,
    id: i64,
    finalized_by: Option<i64>,
    acting_role: &str,
    permissions: &[String],
    session_user_id: Option<i64>,
) -> Result<(), String> {
    if acting_role != "admin" && !permissions.iter().any(|p| p == "finalize_invoice") {
        log_security_event(conn, "finalize_invoice", session_user_id,
            "ERR_PERMISSION: finalize_invoice not granted");
        return Err("ERR_PERMISSION: finalize_invoice not granted".into());
    }

    let status: Option<String> = conn
        .query_row(
            "SELECT status FROM invoices WHERE id=?1",
            [id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    match status.as_deref() {
        None => return Err(format!("Invoice {id} not found")),
        Some("final") => return Err("Invoice is already finalized".into()),
        _ => {}
    }

    conn.execute(
        "UPDATE invoices \
         SET status='final', finalized_by=?1, row_version=row_version+1, updated_at=datetime('now') \
         WHERE id=?2",
        rusqlite::params![finalized_by, id],
    )
    .map_err(|e| e.to_string())?;

    let inv_no: String = conn
        .query_row("SELECT invoice_number FROM invoices WHERE id=?1", [id], |r| r.get(0))
        .unwrap_or_default();
    log_activity(conn, session_user_id, "", ACT_FINALIZE_INVOICE, "invoices", &inv_no);

    Ok(())
}

// Internal helper struct used only by logic_duplicate_invoice.
struct SourceInvoiceRow {
    invoice_date: String,
    transport_mode: String,
    buyer_order_no: String,
    duty_drawback: String,
    hs_code: String,
    other_references: String,
    consignee_name: String,
    consignee_address: String,
    buyer_if_other: String,
    country_of_origin: String,
    country_of_destination: String,
    pre_carriage_by: String,
    place_of_receipt: String,
    pre_carrier: String,
    vessel: String,
    port_of_loading: String,
    port_of_discharge: String,
    final_destination: String,
    terms_of_payment: String,
    incoterm: String,
    currency: String,
    exchange_rate: f64,
    net_weight: String,
    gross_weight: String,
    notes: String,
    show_sa_number: bool,
    purchase_order_id: Option<i64>,
    packing_list_json: Option<String>,
}

/// Reads invoice `source_id` and all its items then creates a fresh draft copy
/// with a new sequence number and `status = "draft"`.
/// Returns the new invoice's id on success.
pub fn logic_duplicate_invoice(
    conn: &Connection,
    source_id: i64,
    created_by: Option<i64>,
    acting_role: &str,
    permissions: &[String],
    session_user_id: Option<i64>,
) -> Result<i64, String> {
    if acting_role != "admin" && !permissions.iter().any(|p| p == "create_invoice") {
        log_security_event(conn, "duplicate_invoice", session_user_id,
            "ERR_PERMISSION: create_invoice not granted");
        return Err("ERR_PERMISSION: create_invoice not granted".into());
    }

    // Load the source invoice row.
    let src = conn.query_row(
        "SELECT invoice_date, transport_mode, buyer_order_no, duty_drawback, hs_code,
                other_references, consignee_name, consignee_address, buyer_if_other,
                country_of_origin, country_of_destination, pre_carriage_by,
                place_of_receipt, pre_carrier, vessel, port_of_loading,
                port_of_discharge, final_destination, terms_of_payment, incoterm,
                currency, exchange_rate, net_weight, gross_weight, notes,
                show_sa_number, purchase_order_id, packing_list
         FROM invoices WHERE id=?1",
        [source_id],
        |r| {
            Ok(SourceInvoiceRow {
                invoice_date:           r.get(0)?,
                transport_mode:         r.get(1)?,
                buyer_order_no:         r.get(2)?,
                duty_drawback:          r.get(3)?,
                hs_code:                r.get(4)?,
                other_references:       r.get(5)?,
                consignee_name:         r.get(6)?,
                consignee_address:      r.get(7)?,
                buyer_if_other:         r.get(8)?,
                country_of_origin:      r.get(9)?,
                country_of_destination: r.get(10)?,
                pre_carriage_by:        r.get(11)?,
                place_of_receipt:       r.get(12)?,
                pre_carrier:            r.get(13)?,
                vessel:                 r.get(14)?,
                port_of_loading:        r.get(15)?,
                port_of_discharge:      r.get(16)?,
                final_destination:      r.get(17)?,
                terms_of_payment:       r.get(18)?,
                incoterm:               r.get(19)?,
                currency:               r.get(20)?,
                exchange_rate:          r.get(21)?,
                net_weight:             r.get(22)?,
                gross_weight:           r.get(23)?,
                notes:                  r.get(24)?,
                show_sa_number:         r.get(25)?,
                purchase_order_id:      r.get(26)?,
                packing_list_json:      r.get(27)?,
            })
        },
    )
    .map_err(|e| format!("Source invoice {source_id} not found: {e}"))?;

    // Load source items.
    let mut stmt = conn
        .prepare(
            "SELECT sr_no, marks_nos, no_of_pkgs, dimensions, dimensions_unit,
                    part_number, sa_number, description, quantity, unit,
                    unit_price, total_amount
             FROM invoice_items WHERE invoice_id=?1 ORDER BY sr_no",
        )
        .map_err(|e| e.to_string())?;
    let items: Vec<InvoiceItemPayload> = stmt
        .query_map([source_id], |r| {
            Ok(InvoiceItemPayload {
                sr_no:           r.get(0)?,
                marks_nos:       r.get(1)?,
                no_of_pkgs:      r.get(2)?,
                dimensions:      r.get(3)?,
                dimensions_unit: r.get(4)?,
                part_number:     r.get(5)?,
                sa_number:       r.get(6)?,
                description:     r.get(7)?,
                quantity:        r.get(8)?,
                unit:            r.get(9)?,
                unit_price:      r.get(10)?,
                total_amount:    r.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string())?;

    let packing_list: Option<Vec<PackingListItemPayload>> = src.packing_list_json
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok());

    let payload = InvoicePayload {
        invoice_number:         String::new(), // allocated fresh by logic_create_invoice
        invoice_date:           src.invoice_date,
        transport_mode:         src.transport_mode,
        buyer_order_no:         src.buyer_order_no,
        duty_drawback:          src.duty_drawback,
        hs_code:                src.hs_code,
        other_references:       src.other_references,
        consignee_name:         src.consignee_name,
        consignee_address:      src.consignee_address,
        buyer_if_other:         src.buyer_if_other,
        country_of_origin:      src.country_of_origin,
        country_of_destination: src.country_of_destination,
        pre_carriage_by:        src.pre_carriage_by,
        place_of_receipt:       src.place_of_receipt,
        pre_carrier:            src.pre_carrier,
        vessel:                 src.vessel,
        port_of_loading:        src.port_of_loading,
        port_of_discharge:      src.port_of_discharge,
        final_destination:      src.final_destination,
        terms_of_payment:       src.terms_of_payment,
        incoterm:               src.incoterm,
        currency:               src.currency,
        exchange_rate:          src.exchange_rate,
        net_weight:             src.net_weight,
        gross_weight:           src.gross_weight,
        notes:                  src.notes,
        status:                 "draft".into(),
        show_sa_number:         src.show_sa_number,
        purchase_order_id:      src.purchase_order_id,
        items,
        packing_list,
    };

    logic_create_invoice(conn, &payload, created_by, acting_role, permissions, session_user_id)
}

// ── Tauri commands ────────────────────────────────────────────────────────────
// Role and identity are read from the server-side AuthSession — they are never
// accepted from the frontend IPC payload.

#[tauri::command]
pub fn create_invoice(
    db: State<'_, AppDb>,
    session: State<'_, AuthSession>,
    payload: InvoicePayload,
) -> Result<i64, String> {
    let sess = session.get()?;
    db.with_conn(|conn| logic_create_invoice(conn, &payload, Some(sess.user_id), &sess.role, &sess.permissions, Some(sess.user_id)))
}

#[tauri::command]
pub fn update_invoice(
    db: State<'_, AppDb>,
    session: State<'_, AuthSession>,
    id: i64,
    expected_row_version: i64,
    payload: InvoicePayload,
) -> Result<(), String> {
    let sess = session.get()?;
    db.with_conn(|conn| logic_update_invoice(conn, id, &payload, expected_row_version, &sess.role, &sess.permissions, Some(sess.user_id)))
}

#[tauri::command]
pub fn delete_invoice(
    db: State<'_, AppDb>,
    session: State<'_, AuthSession>,
    id: i64,
) -> Result<(), String> {
    let sess = session.get()?;
    db.with_conn(|conn| logic_delete_invoice(conn, id, &sess.role, &sess.permissions, Some(sess.user_id)))
}

#[tauri::command]
pub fn finalize_invoice(
    db: State<'_, AppDb>,
    session: State<'_, AuthSession>,
    id: i64,
) -> Result<(), String> {
    let sess = session.get()?;
    db.with_conn(|conn| logic_finalize_invoice(conn, id, Some(sess.user_id), &sess.role, &sess.permissions, Some(sess.user_id)))
}

#[tauri::command]
pub fn duplicate_invoice(
    db: State<'_, AppDb>,
    session: State<'_, AuthSession>,
    id: i64,
) -> Result<i64, String> {
    let sess = session.get()?;
    db.with_conn(|conn| logic_duplicate_invoice(conn, id, Some(sess.user_id), &sess.role, &sess.permissions, Some(sess.user_id)))
}

// ── tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn create_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE invoice_sequence (
                year INTEGER PRIMARY KEY,
                last_number INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE invoices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                invoice_number TEXT NOT NULL UNIQUE,
                invoice_date TEXT NOT NULL,
                transport_mode TEXT NOT NULL DEFAULT 'BY SEA',
                buyer_order_no TEXT NOT NULL DEFAULT '',
                duty_drawback TEXT NOT NULL DEFAULT '',
                hs_code TEXT NOT NULL DEFAULT '',
                other_references TEXT NOT NULL DEFAULT '',
                consignee_name TEXT NOT NULL DEFAULT '',
                consignee_address TEXT NOT NULL DEFAULT '',
                buyer_if_other TEXT NOT NULL DEFAULT '',
                country_of_origin TEXT NOT NULL DEFAULT 'INDIA',
                country_of_destination TEXT NOT NULL DEFAULT '',
                pre_carriage_by TEXT NOT NULL DEFAULT '',
                place_of_receipt TEXT NOT NULL DEFAULT '',
                pre_carrier TEXT NOT NULL DEFAULT '',
                vessel TEXT NOT NULL DEFAULT '',
                port_of_loading TEXT NOT NULL DEFAULT '',
                port_of_discharge TEXT NOT NULL DEFAULT '',
                final_destination TEXT NOT NULL DEFAULT '',
                terms_of_payment TEXT NOT NULL DEFAULT '',
                currency TEXT NOT NULL DEFAULT 'USD',
                exchange_rate REAL NOT NULL DEFAULT 1.0,
                net_weight TEXT NOT NULL DEFAULT '',
                gross_weight TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'draft',
                purchase_order_id INTEGER,
                created_by INTEGER,
                finalized_by INTEGER,
                incoterm TEXT NOT NULL DEFAULT '',
                show_sa_number BOOLEAN NOT NULL DEFAULT TRUE,
                packing_list TEXT NOT NULL DEFAULT '[]',
                row_version INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE invoice_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
                sr_no INTEGER NOT NULL,
                marks_nos TEXT NOT NULL DEFAULT '',
                no_of_pkgs TEXT NOT NULL DEFAULT '',
                dimensions TEXT NOT NULL DEFAULT '',
                dimensions_unit TEXT NOT NULL DEFAULT '',
                part_number TEXT NOT NULL DEFAULT '',
                sa_number TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT '',
                quantity REAL NOT NULL DEFAULT 1.0,
                unit TEXT NOT NULL DEFAULT 'NOS',
                unit_price REAL NOT NULL DEFAULT 0.0,
                total_amount REAL NOT NULL DEFAULT 0.0
            );
            "#,
        )
        .unwrap();
        conn
    }

    fn minimal_payload(status: &str) -> InvoicePayload {
        InvoicePayload {
            invoice_number: String::new(),
            invoice_date: "2025-06-15".to_string(),
            transport_mode: "BY SEA".to_string(),
            buyer_order_no: String::new(),
            duty_drawback: String::new(),
            hs_code: String::new(),
            other_references: String::new(),
            consignee_name: "ACME Corp".to_string(),
            consignee_address: "123 Main St, New York".to_string(),
            buyer_if_other: String::new(),
            country_of_origin: "INDIA".to_string(),
            country_of_destination: "USA".to_string(),
            pre_carriage_by: String::new(),
            place_of_receipt: String::new(),
            pre_carrier: String::new(),
            vessel: String::new(),
            port_of_loading: String::new(),
            port_of_discharge: String::new(),
            final_destination: String::new(),
            terms_of_payment: String::new(),
            incoterm: String::new(),
            currency: "USD".to_string(),
            exchange_rate: 84.0,
            net_weight: String::new(),
            gross_weight: String::new(),
            notes: String::new(),
            status: status.to_string(),
            show_sa_number: true,
            purchase_order_id: None,
            items: vec![InvoiceItemPayload {
                sr_no: 1,
                marks_nos: String::new(),
                no_of_pkgs: String::new(),
                dimensions: String::new(),
                dimensions_unit: String::new(),
                part_number: "P001".to_string(),
                sa_number: "SA-42".to_string(),
                description: "Widget A".to_string(),
                quantity: 10.0,
                unit: "NOS".to_string(),
                unit_price: 5.0,
                total_amount: 50.0,
            }],
            packing_list: None,
        }
    }

    #[test]
    fn create_as_admin_succeeds() {
        let conn = create_test_db();
        let id = logic_create_invoice(&conn, &minimal_payload("draft"), None, "admin", &[], None)
            .unwrap();
        assert!(id > 0);

        let num: String = conn
            .query_row(
                "SELECT invoice_number FROM invoices WHERE id=?1",
                [id],
                |r| r.get(0),
            )
            .unwrap();
        assert!(num.starts_with("EXP/"), "expected EXP/… got {num}");
    }

    #[test]
    fn create_as_operator_succeeds() {
        let conn = create_test_db();
        let id = logic_create_invoice(&conn, &minimal_payload("draft"), Some(1), "operator", &["create_invoice".to_string()], None)
            .unwrap();
        assert!(id > 0);
    }

    #[test]
    fn create_as_viewer_denied() {
        let conn = create_test_db();
        let err = logic_create_invoice(&conn, &minimal_payload("draft"), None, "viewer", &[], None)
            .unwrap_err();
        assert!(err.contains("ERR_PERMISSION:"), "got: {err}");
    }

    #[test]
    fn sequence_increments_correctly_per_fiscal_year() {
        let conn = create_test_db();

        // April 2025 → FY 2025-26
        let mut p = minimal_payload("draft");
        p.invoice_date = "2025-04-01".to_string();
        let id1 = logic_create_invoice(&conn, &p, None, "admin", &[], None).unwrap();
        let num1: String = conn
            .query_row("SELECT invoice_number FROM invoices WHERE id=?1", [id1], |r| r.get(0))
            .unwrap();
        assert_eq!(num1, "EXP/1/2025-26");

        let id2 = logic_create_invoice(&conn, &p, None, "admin", &[], None).unwrap();
        let num2: String = conn
            .query_row("SELECT invoice_number FROM invoices WHERE id=?1", [id2], |r| r.get(0))
            .unwrap();
        assert_eq!(num2, "EXP/2/2025-26");

        // January 2025 → FY 2024-25 (separate sequence)
        p.invoice_date = "2025-01-10".to_string();
        let id3 = logic_create_invoice(&conn, &p, None, "admin", &[], None).unwrap();
        let num3: String = conn
            .query_row("SELECT invoice_number FROM invoices WHERE id=?1", [id3], |r| r.get(0))
            .unwrap();
        assert_eq!(num3, "EXP/1/2024-25");
    }

    #[test]
    fn sa_number_preserved_on_update() {
        // Regression test: the old TypeScript updateInvoice omitted sa_number from
        // the item re-INSERT, silently clearing it on every save. This Rust
        // implementation must not repeat that bug.
        let conn = create_test_db();
        let id = logic_create_invoice(&conn, &minimal_payload("draft"), None, "admin", &[], None).unwrap();

        let sa_before: String = conn
            .query_row(
                "SELECT sa_number FROM invoice_items WHERE invoice_id=?1",
                [id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(sa_before, "SA-42");

        let mut p = minimal_payload("draft");
        p.invoice_number = format!("EXP/1/2025-26"); // keep same invoice number
        p.items[0].sa_number = "SA-99".to_string();
        logic_update_invoice(&conn, id, &p, 1, "admin", &[], None).unwrap();

        let sa_after: String = conn
            .query_row(
                "SELECT sa_number FROM invoice_items WHERE invoice_id=?1",
                [id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(sa_after, "SA-99");
    }

    #[test]
    fn operator_cannot_edit_final_invoice() {
        let conn = create_test_db();
        let id = logic_create_invoice(&conn, &minimal_payload("final"), None, "admin", &[], None).unwrap();
        let err = logic_update_invoice(&conn, id, &minimal_payload("draft"), 1, "operator", &["edit_invoice".to_string()], None)
            .unwrap_err();
        assert!(err.contains("ERR_PERMISSION:"), "got: {err}");
    }

    #[test]
    fn admin_can_edit_final_invoice() {
        let conn = create_test_db();
        let id = logic_create_invoice(&conn, &minimal_payload("final"), None, "admin", &[], None).unwrap();
        let mut p = minimal_payload("draft");
        p.invoice_number = "EXP/1/2025-26".to_string();
        logic_update_invoice(&conn, id, &p, 1, "admin", &[], None).unwrap();
        let status: String = conn
            .query_row("SELECT status FROM invoices WHERE id=?1", [id], |r| r.get(0))
            .unwrap();
        assert_eq!(status, "draft");
    }

    #[test]
    fn viewer_cannot_update() {
        let conn = create_test_db();
        let id = logic_create_invoice(&conn, &minimal_payload("draft"), None, "admin", &[], None).unwrap();
        let err = logic_update_invoice(&conn, id, &minimal_payload("draft"), 1, "viewer", &[], None)
            .unwrap_err();
        assert!(err.contains("ERR_PERMISSION:"), "got: {err}");
    }

    #[test]
    fn update_nonexistent_invoice_returns_error() {
        let conn = create_test_db();
        let err = logic_update_invoice(&conn, 9999, &minimal_payload("draft"), 1, "admin", &[], None)
            .unwrap_err();
        assert!(err.contains("not found"), "got: {err}");
    }

    #[test]
    fn update_with_stale_row_version_returns_conflict() {
        let conn = create_test_db();
        let id = logic_create_invoice(&conn, &minimal_payload("draft"), None, "admin", &[], None).unwrap();
        // First update succeeds and bumps row_version to 2.
        let mut p = minimal_payload("draft");
        p.invoice_number = "EXP/1/2025-26".to_string();
        logic_update_invoice(&conn, id, &p, 1, "admin", &[], None).unwrap();
        // Second update with stale version 1 must be rejected.
        let err = logic_update_invoice(&conn, id, &p, 1, "admin", &[], None).unwrap_err();
        assert!(err.contains("CONFLICT"), "expected CONFLICT, got: {err}");
        // Correct version 2 succeeds.
        logic_update_invoice(&conn, id, &p, 2, "admin", &[], None).unwrap();
    }

    #[test]
    fn packing_list_round_trips() {
        let conn = create_test_db();
        let mut p = minimal_payload("draft");
        p.packing_list = Some(vec![PackingListItemPayload {
            sr_no: 1,
            marks_nos: "BOX-1".to_string(),
            no_of_pkgs: "5".to_string(),
            dimensions: "30x20x15".to_string(),
            dimensions_unit: "CM".to_string(),
            net_weight: Some("10.5".to_string()),
            gross_weight: Some("11.0".to_string()),
        }]);
        let id = logic_create_invoice(&conn, &p, None, "admin", &[], None).unwrap();

        let pl_json: String = conn
            .query_row("SELECT packing_list FROM invoices WHERE id=?1", [id], |r| r.get(0))
            .unwrap();
        assert!(pl_json.contains("BOX-1"), "packing_list not stored: {pl_json}");
    }

    // ── delete_invoice tests ──────────────────────────────────────────────────

    #[test]
    fn delete_requires_admin() {
        let conn = create_test_db();
        let id = logic_create_invoice(&conn, &minimal_payload("draft"), None, "admin", &[], None).unwrap();
        assert!(logic_delete_invoice(&conn, id, "operator", &[], None).is_err());
        assert!(logic_delete_invoice(&conn, id, "viewer", &[], None).is_err());
    }

    #[test]
    fn delete_removes_invoice_and_resets_sequence() {
        let conn = create_test_db();
        let mut p = minimal_payload("draft");
        p.invoice_date = "2025-06-01".to_string();
        let id1 = logic_create_invoice(&conn, &p, None, "admin", &[], None).unwrap();
        let id2 = logic_create_invoice(&conn, &p, None, "admin", &[], None).unwrap();

        // Sequence is now at 2 (EXP/1/… and EXP/2/…).
        logic_delete_invoice(&conn, id2, "admin", &[], None).unwrap();

        // Invoice is gone.
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM invoices WHERE id=?1", [id2], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);

        // Sequence rolled back to 1 so the next invoice gets EXP/2/… again.
        let seq: i64 = conn
            .query_row(
                "SELECT last_number FROM invoice_sequence WHERE year=2025",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(seq, 1, "sequence should be 1 after deleting EXP/2/…");

        // Create again — should reclaim EXP/2/2025-26.
        let id3 = logic_create_invoice(&conn, &p, None, "admin", &[], None).unwrap();
        let _ = id1; // keep id1 in scope
        let num: String = conn
            .query_row("SELECT invoice_number FROM invoices WHERE id=?1", [id3], |r| r.get(0))
            .unwrap();
        assert_eq!(num, "EXP/2/2025-26");
    }

    // ── finalize_invoice tests ────────────────────────────────────────────────

    #[test]
    fn finalize_requires_admin() {
        let conn = create_test_db();
        let id = logic_create_invoice(&conn, &minimal_payload("draft"), None, "admin", &[], None).unwrap();
        assert!(logic_finalize_invoice(&conn, id, None, "operator", &[], None).is_err());
        assert!(logic_finalize_invoice(&conn, id, None, "viewer", &[], None).is_err());
    }

    #[test]
    fn finalize_sets_status_and_finalized_by() {
        let conn = create_test_db();
        let id = logic_create_invoice(&conn, &minimal_payload("draft"), None, "admin", &[], None).unwrap();
        logic_finalize_invoice(&conn, id, Some(42), "admin", &[], None).unwrap();

        let (status, fin_by): (String, Option<i64>) = conn
            .query_row(
                "SELECT status, finalized_by FROM invoices WHERE id=?1",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(status, "final");
        assert_eq!(fin_by, Some(42));
    }

    #[test]
    fn finalize_already_final_returns_err() {
        let conn = create_test_db();
        let id = logic_create_invoice(&conn, &minimal_payload("final"), None, "admin", &[], None).unwrap();
        let err = logic_finalize_invoice(&conn, id, None, "admin", &[], None).unwrap_err();
        assert!(err.contains("already finalized"), "got: {err}");
    }

    #[test]
    fn finalize_nonexistent_invoice_returns_err() {
        let conn = create_test_db();
        let err = logic_finalize_invoice(&conn, 9999, None, "admin", &[], None).unwrap_err();
        assert!(err.contains("not found"), "got: {err}");
    }
}
