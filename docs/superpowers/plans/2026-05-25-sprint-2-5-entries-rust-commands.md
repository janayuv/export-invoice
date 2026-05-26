# Sprint 2.5: Entries Writes → Rust Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all `entries` write operations (create/update/delete) from frontend `db.execute()` calls into Rust Tauri commands with session-based RBAC, so `sql:allow-execute` can be removed in Sprint 2.6.

**Architecture:** New `src-tauri/src/commands/entry.rs` follows the same `logic_*` + Tauri wrapper pattern as `invoice.rs` and `customer.rs`. All validation (link existence, invoice↔customer↔PO consistency, invoice_total recompute) moves from TypeScript into Rust. The TypeScript hook replaces all `db.execute()` write calls with `invoke(...)`, keeping reads as-is. RBAC: create/update → admin or operator; delete → admin only.

**Tech Stack:** Rust (rusqlite, serde_json), Tauri 2, TypeScript, React 19

**Sprint 2.6 gate:** After this sprint, `Select-String -Path "src/hooks/useEntries.ts" -Pattern "db\.execute"` must return no matches before Sprint 2.6 begins.

---

## File Structure

| File | Change |
|------|--------|
| `src-tauri/src/commands/entry.rs` | **Create** — payload types, logic functions, Tauri commands, tests |
| `src-tauri/src/commands/mod.rs` | Add `pub mod entry;` |
| `src-tauri/src/lib.rs` | Register 3 new commands |
| `src/hooks/useEntries.ts` | Replace `db.execute()` writes with `invoke`; remove dead validation helper |

---

## Task 1: Rust command file — skeleton + RBAC tests

**Files:**
- Create: `src-tauri/src/commands/entry.rs`
- Modify: `src-tauri/src/commands/mod.rs`

- [ ] **Step 1.1: Add `pub mod entry;` to mod.rs**

Open `src-tauri/src/commands/mod.rs`. Add:

```rust
pub mod entry;
```

alongside the existing `pub mod auth;`, `pub mod invoice;`, `pub mod customer;`, `pub mod purchase_order;`.

- [ ] **Step 1.2: Create entry.rs with payload types, todo stubs, and failing RBAC tests**

Create `src-tauri/src/commands/entry.rs`:

```rust
use rusqlite::Connection;
use tauri::State;

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
        use rusqlite::OptionalExtension;
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
            "Permission denied: create_entry requires admin or operator role",
        );
        return Err("Permission denied: create_entry requires admin or operator role".into());
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

    Ok(conn.last_insert_rowid())
}

pub fn logic_update_entry(
    conn: &Connection,
    id: i64,
    payload: &EntryPayload,
    acting_role: &str,
    session_user_id: Option<i64>,
) -> Result<(), String> {
    if acting_role != "admin" && acting_role != "operator" {
        log_security_event(
            conn, "update_entry", session_user_id,
            "Permission denied: update_entry requires admin or operator role",
        );
        return Err("Permission denied: update_entry requires admin or operator role".into());
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
                status=?21, updated_at=datetime('now')
             WHERE id=?22",
            rusqlite::params![
                payload.customer_id, payload.invoice_id, payload.purchase_order_id,
                payload.customer_name, payload.customer_address,
                payload.invoice_number, payload.invoice_date,
                payload.po_number, payload.po_date, payload.customer_po_no,
                payload.currency, payload.exchange_rate, invoice_total, items_json,
                payload.local_invoice_no, payload.local_invoice_date,
                payload.shipping_bill_no, payload.shipping_bill_date,
                payload.bl_awb_no, payload.bl_awb_date,
                payload.status, id,
            ],
        )
        .map_err(|e| e.to_string())?;

    if rows == 0 {
        return Err(format!("Entry {id} not found"));
    }
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
            "Permission denied: delete_entry requires admin role",
        );
        return Err("Permission denied: delete_entry requires admin role".into());
    }

    conn.execute("DELETE FROM entries WHERE id=?1", [id])
        .map_err(|e| e.to_string())?;
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
    payload: EntryPayload,
) -> Result<(), String> {
    let sess = session.get()?;
    db.with_conn(|conn| logic_update_entry(conn, id, &payload, &sess.role, Some(sess.user_id)))
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
        assert!(err.contains("Permission denied"), "got: {err}");
    }

    #[test]
    fn update_denied_for_viewer() {
        let conn = create_test_db();
        let err = logic_update_entry(&conn, 1, &minimal_payload(), "viewer", None).unwrap_err();
        assert!(err.contains("Permission denied"), "got: {err}");
    }

    #[test]
    fn delete_denied_for_operator() {
        let conn = create_test_db();
        let err = logic_delete_entry(&conn, 1, "operator", None).unwrap_err();
        assert!(err.contains("Permission denied"), "got: {err}");
    }

    #[test]
    fn delete_denied_for_viewer() {
        let conn = create_test_db();
        let err = logic_delete_entry(&conn, 1, "viewer", None).unwrap_err();
        assert!(err.contains("Permission denied"), "got: {err}");
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
        logic_update_entry(&conn, id, &p, "admin", None).unwrap();
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
        // Two items; total_amount values are what gets summed (the form already did qty*price).
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
        p.customer_id = Some(c1);   // Cust1
        p.invoice_id  = Some(inv_id); // but invoice belongs to Cust2's PO
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
        p.invoice_id = Some(inv_id); // links to po_a
        p.purchase_order_id = Some(po_b); // but we say po_b
        let err = logic_create_entry(&conn, &p, None, "admin", None).unwrap_err();
        assert!(err.contains("does not match"), "got: {err}");
    }

    #[test]
    fn update_returns_err_for_nonexistent_entry() {
        let conn = create_test_db();
        let err = logic_update_entry(&conn, 9999, &minimal_payload(), "admin", None).unwrap_err();
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
```

- [ ] **Step 1.3: Run tests — verify all pass**

```powershell
cd D:\Export-Invoice\src-tauri; cargo test --lib entry 2>&1 | Select-String -Pattern "test result|FAILED"
```

Expected: `test result: ok. 16 passed; 0 failed`

- [ ] **Step 1.4: Run full suite — no regressions**

```powershell
cd D:\Export-Invoice\src-tauri; cargo test 2>&1 | Select-String -Pattern "test result|FAILED"
```

Expected: all tests pass (prior 48 + 16 new = 64).

- [ ] **Step 1.5: Commit**

```powershell
cd D:\Export-Invoice; git add src-tauri/src/commands/entry.rs src-tauri/src/commands/mod.rs; git commit -m @'
feat(entry): Rust commands create_entry/update_entry/delete_entry

- RBAC: create/update require admin or operator; delete requires admin
- validate_entry_links: customer/invoice/PO existence + invoice-customer-PO consistency
- recompute_total: authoritative sum of item total_amounts, rounded to 2dp
- items serialized as JSON array matching TS EntryItem shape
- 16 integration tests covering RBAC, link validation, happy paths, total recompute

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
'@
```

---

## Task 2: Register commands in lib.rs

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 2.1: Add the three commands to generate_handler![]**

In `src-tauri/src/lib.rs`, inside `generate_handler![]`, add after the existing customer commands:

```rust
            commands::entry::create_entry,
            commands::entry::update_entry,
            commands::entry::delete_entry,
```

- [ ] **Step 2.2: Build**

```powershell
cd D:\Export-Invoice\src-tauri; cargo build 2>&1 | Select-String -Pattern "^error"
```

Expected: no output (clean build).

- [ ] **Step 2.3: Commit**

```powershell
cd D:\Export-Invoice; git add src-tauri/src/lib.rs; git commit -m @'
feat(entry): register create_entry, update_entry, delete_entry in generate_handler

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
'@
```

---

## Task 3: Update useEntries.ts — replace db.execute() with invoke()

**Files:**
- Modify: `src/hooks/useEntries.ts`

The reads (`useEntries` hook, `getEntry`, `getEntriesReport`, `getInvoicesByCustomerId`) stay unchanged using `db.select()`. Only the three write functions and the now-dead `validateEntryLinks` helper change.

- [ ] **Step 3.1: Rewrite the file**

Replace the full content of `src/hooks/useEntries.ts` with:

```typescript
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getDb } from "@/lib/db";
import type { Entry, EntryFormValues, EntryItem } from "@/lib/types";

/** List row for the Entry table. */
export interface EntrySummary {
  id: number;
  customer_name: string;
  invoice_number: string;
  invoice_date: string;
  po_number: string;
  local_invoice_no: string;
  shipping_bill_no: string;
  status: string;
  created_at: string;
}

/** Invoice picker row, scoped to a customer via the invoice's linked PO. */
export interface InvoiceForCustomer {
  id: number;
  invoice_number: string;
  invoice_date: string;
  currency: string;
  purchase_order_id: number | null;
}

export function useEntries() {
  const [entries, setEntries] = useState<EntrySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    try {
      setLoading(true);
      const db = await getDb();
      const rows = await db.select<EntrySummary[]>(
        `SELECT id, customer_name, invoice_number, invoice_date, po_number,
                local_invoice_no, shipping_bill_no, status, created_at
         FROM entries ORDER BY created_at DESC`
      );
      setEntries(rows);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  return { entries, loading, error, reload: loadList };
}

export async function getEntry(id: number): Promise<Entry | null> {
  const db = await getDb();
  const rows = await db.select<Entry[]>("SELECT * FROM entries WHERE id = ?", [id]);
  if (rows.length === 0) return null;
  const entry = rows[0];
  entry.items = JSON.parse(
    (entry.items as unknown as string) || "[]"
  ) as EntryItem[];
  return entry;
}

/**
 * All entries with their line-item snapshots parsed, for the report view.
 * Snapshot-based: reads denormalized fields from entries table only.
 */
export async function getEntriesReport(): Promise<Entry[]> {
  const db = await getDb();
  const rows = await db.select<Entry[]>(
    "SELECT * FROM entries ORDER BY created_at DESC"
  );
  return rows.map((e) => ({
    ...e,
    items: JSON.parse((e.items as unknown as string) || "[]") as EntryItem[],
  }));
}

/**
 * Invoices available to link to an entry for a given customer.
 * Excludes invoices already referenced by another entry (except the current one).
 */
export async function getInvoicesByCustomerId(
  customerId: number,
  currentEntryId: number | null = null
): Promise<InvoiceForCustomer[]> {
  const db = await getDb();
  return db.select<InvoiceForCustomer[]>(
    `SELECT i.id, i.invoice_number, i.invoice_date, i.currency, i.purchase_order_id
     FROM invoices i
     LEFT JOIN purchase_orders po ON i.purchase_order_id = po.id
     WHERE (po.customer_id = ? OR i.purchase_order_id IS NULL)
       AND i.id NOT IN (
         SELECT invoice_id FROM entries
         WHERE invoice_id IS NOT NULL
           AND id != COALESCE(?, 0)
       )
     ORDER BY i.created_at DESC`,
    [customerId, currentEntryId]
  );
}

// ── Write commands — all validation and RBAC now live in Rust ─────────────────

export async function createEntry(
  data: EntryFormValues,
  createdBy?: number
): Promise<number> {
  return invoke<number>("create_entry", {
    payload: {
      customer_id:        data.customer_id,
      invoice_id:         data.invoice_id,
      purchase_order_id:  data.purchase_order_id,
      customer_name:      data.customer_name,
      customer_address:   data.customer_address,
      invoice_number:     data.invoice_number,
      invoice_date:       data.invoice_date,
      po_number:          data.po_number,
      po_date:            data.po_date,
      customer_po_no:     data.customer_po_no,
      currency:           data.currency,
      exchange_rate:      data.exchange_rate,
      items:              data.items,
      local_invoice_no:   data.local_invoice_no,
      local_invoice_date: data.local_invoice_date,
      shipping_bill_no:   data.shipping_bill_no,
      shipping_bill_date: data.shipping_bill_date,
      bl_awb_no:          data.bl_awb_no,
      bl_awb_date:        data.bl_awb_date,
      status:             data.status,
    },
    createdBy: createdBy ?? null,
  });
}

export async function updateEntry(
  id: number,
  data: EntryFormValues
): Promise<void> {
  await invoke("update_entry", {
    id,
    payload: {
      customer_id:        data.customer_id,
      invoice_id:         data.invoice_id,
      purchase_order_id:  data.purchase_order_id,
      customer_name:      data.customer_name,
      customer_address:   data.customer_address,
      invoice_number:     data.invoice_number,
      invoice_date:       data.invoice_date,
      po_number:          data.po_number,
      po_date:            data.po_date,
      customer_po_no:     data.customer_po_no,
      currency:           data.currency,
      exchange_rate:      data.exchange_rate,
      items:              data.items,
      local_invoice_no:   data.local_invoice_no,
      local_invoice_date: data.local_invoice_date,
      shipping_bill_no:   data.shipping_bill_no,
      shipping_bill_date: data.shipping_bill_date,
      bl_awb_no:          data.bl_awb_no,
      bl_awb_date:        data.bl_awb_date,
      status:             data.status,
    },
  });
}

export async function deleteEntry(id: number): Promise<void> {
  await invoke("delete_entry", { id });
}
```

- [ ] **Step 3.2: TypeScript check**

```powershell
cd D:\Export-Invoice; npx tsc --noEmit 2>&1 | Select-String -Pattern "error TS"
```

Expected: no output.

- [ ] **Step 3.3: Confirm Sprint 2.6 gate is clear**

```powershell
Select-String -Path "src/hooks/useEntries.ts" -Pattern "db\.execute"
```

Expected: **no output** (no matches).

- [ ] **Step 3.4: Commit**

```powershell
cd D:\Export-Invoice; git add src/hooks/useEntries.ts; git commit -m @'
refactor(entries): replace db.execute() writes with invoke() Rust commands

createEntry, updateEntry, deleteEntry now call Rust via IPC.
validateEntryLinks removed — validation lives in Rust logic_* functions.
withTransaction and Database imports dropped — no longer needed for writes.
Reads (useEntries, getEntry, getEntriesReport, getInvoicesByCustomerId) unchanged.

Sprint 2.6 gate: db.execute() no longer present in useEntries.ts.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
'@
```

---

## Verification Checklist

- [ ] **All Rust tests pass**

```powershell
cd D:\Export-Invoice\src-tauri; cargo test 2>&1 | Select-String -Pattern "test result"
```

Expected: `test result: ok. 64 passed; 0 failed; 0 ignored`

- [ ] **TypeScript clean**

```powershell
cd D:\Export-Invoice; npx tsc --noEmit 2>&1 | Select-String -Pattern "error TS"
```

Expected: no output.

- [ ] **Sprint 2.6 gate confirmed**

```powershell
Select-String -Path "src/hooks/useEntries.ts" -Pattern "db\.execute"
```

Expected: no output.

- [ ] **Frontend build**

```powershell
cd D:\Export-Invoice; npm run build 2>&1 | Select-String -Pattern "error"
```

Expected: no errors.

- [ ] **Manual smoke-test**

```powershell
cd D:\Export-Invoice; npm run tauri dev
```

1. Log in as admin → go to Entries → Create a new entry → should succeed.
2. Edit the entry → save changes → should update correctly.
3. Log in as operator → edit entry → should succeed. Attempt delete → should be denied with "Permission denied" error.
4. Log in as admin → delete the entry → should succeed.
5. Open DevTools console and verify the invoke works directly:
   ```js
   await window.__TAURI__.core.invoke("create_entry", {
     payload: {
       customer_id: null, invoice_id: null, purchase_order_id: null,
       customer_name: "Smoke Test", customer_address: "",
       invoice_number: "SMOKE/1", invoice_date: "2025-06-01",
       po_number: "", po_date: "", customer_po_no: "",
       currency: "USD", exchange_rate: 1.0, items: [],
       local_invoice_no: "", local_invoice_date: "",
       shipping_bill_no: "", shipping_bill_date: "",
       bl_awb_no: "", bl_awb_date: "", status: "draft"
     },
     createdBy: null
   });
   // Expected: a positive integer (new entry id)
   ```

---

## Sprint 2.6 Gate

Sprint 2.6 (removing `sql:allow-execute` from `src-tauri/capabilities/default.json`) **may now begin**. Confirm one last time:

```powershell
Select-String -Path "src/hooks/useEntries.ts" -Pattern "db\.execute"
```

No matches → Sprint 2.6 is unblocked.
