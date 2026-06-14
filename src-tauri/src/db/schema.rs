use tauri_plugin_sql::{Migration, MigrationKind};

pub fn get_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_company_settings",
            sql: r#"
                PRAGMA foreign_keys = ON;

                CREATE TABLE IF NOT EXISTS company_settings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL DEFAULT '',
                    address TEXT NOT NULL DEFAULT '',
                    gstin TEXT NOT NULL DEFAULT '',
                    pan TEXT NOT NULL DEFAULT '',
                    iec TEXT NOT NULL DEFAULT '',
                    bank_name TEXT NOT NULL DEFAULT '',
                    bank_account TEXT NOT NULL DEFAULT '',
                    ifsc TEXT NOT NULL DEFAULT '',
                    swift TEXT NOT NULL DEFAULT '',
                    bank_ad_code TEXT NOT NULL DEFAULT '',
                    lut_arn_no TEXT NOT NULL DEFAULT '',
                    lut_arn_date TEXT NOT NULL DEFAULT '',
                    place TEXT NOT NULL DEFAULT '',
                    signatory_name TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                INSERT OR IGNORE INTO company_settings (id) VALUES (1);
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_invoices",
            sql: r#"
                CREATE TABLE IF NOT EXISTS invoices (
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
                    status TEXT NOT NULL DEFAULT 'draft'
                        CHECK(status IN ('draft', 'final')),
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
                );
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "create_invoice_items",
            sql: r#"
                CREATE TABLE IF NOT EXISTS invoice_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    invoice_id INTEGER NOT NULL
                        REFERENCES invoices(id) ON DELETE CASCADE,
                    sr_no INTEGER NOT NULL,
                    marks_nos TEXT NOT NULL DEFAULT '',
                    no_of_pkgs TEXT NOT NULL DEFAULT '',
                    dimensions TEXT NOT NULL DEFAULT '',
                    part_number TEXT NOT NULL DEFAULT '',
                    description TEXT NOT NULL DEFAULT '',
                    quantity REAL NOT NULL DEFAULT 1.0,
                    unit TEXT NOT NULL DEFAULT 'NOS',
                    unit_price REAL NOT NULL DEFAULT 0.0,
                    total_amount REAL NOT NULL DEFAULT 0.0
                );

                CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id
                    ON invoice_items(invoice_id);
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "create_invoice_sequence",
            sql: r#"
                CREATE TABLE IF NOT EXISTS invoice_sequence (
                    year INTEGER PRIMARY KEY,
                    last_number INTEGER NOT NULL DEFAULT 0
                );
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "create_users",
            sql: r#"
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    pin_hash TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'viewer'
                        CHECK(role IN ('admin', 'operator', 'viewer')),
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
                );
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add_created_by_to_invoices",
            sql: r#"
                ALTER TABLE invoices ADD COLUMN created_by INTEGER REFERENCES users(id);
                ALTER TABLE invoices ADD COLUMN finalized_by INTEGER REFERENCES users(id);
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "create_customers",
            sql: r#"
                CREATE TABLE IF NOT EXISTS customers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    address TEXT NOT NULL DEFAULT '',
                    buyer_if_other TEXT NOT NULL DEFAULT '',
                    country_of_destination TEXT NOT NULL DEFAULT '',
                    port_of_discharge TEXT NOT NULL DEFAULT '',
                    final_destination TEXT NOT NULL DEFAULT '',
                    terms_of_payment TEXT NOT NULL DEFAULT '',
                    currency TEXT NOT NULL DEFAULT 'USD',
                    transport_mode TEXT NOT NULL DEFAULT 'BY SEA',
                    pre_carriage_by TEXT NOT NULL DEFAULT 'BY ROAD',
                    place_of_receipt TEXT NOT NULL DEFAULT 'CHENNAI',
                    pre_carrier TEXT NOT NULL DEFAULT 'CHENNAI',
                    port_of_loading TEXT NOT NULL DEFAULT 'CHENNAI',
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
                );
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "simplify_customers",
            sql: r#"
                ALTER TABLE customers DROP COLUMN buyer_if_other;
                ALTER TABLE customers DROP COLUMN terms_of_payment;
                ALTER TABLE customers DROP COLUMN transport_mode;
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "create_purchase_order_module",
            sql: r#"
                CREATE TABLE IF NOT EXISTS suppliers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    address TEXT NOT NULL DEFAULT '',
                    contact_person TEXT NOT NULL DEFAULT '',
                    phone TEXT NOT NULL DEFAULT '',
                    email TEXT NOT NULL DEFAULT '',
                    gstin TEXT NOT NULL DEFAULT '',
                    currency TEXT NOT NULL DEFAULT 'INR',
                    payment_terms TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS po_sequence (
                    year INTEGER PRIMARY KEY,
                    last_number INTEGER NOT NULL DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS purchase_orders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    po_number TEXT NOT NULL UNIQUE,
                    po_date TEXT NOT NULL,
                    supplier_id INTEGER REFERENCES suppliers(id),
                    supplier_name TEXT NOT NULL DEFAULT '',
                    supplier_address TEXT NOT NULL DEFAULT '',
                    supplier_gstin TEXT NOT NULL DEFAULT '',
                    delivery_date TEXT NOT NULL DEFAULT '',
                    delivery_address TEXT NOT NULL DEFAULT '',
                    payment_terms TEXT NOT NULL DEFAULT '',
                    currency TEXT NOT NULL DEFAULT 'INR',
                    exchange_rate REAL NOT NULL DEFAULT 1.0,
                    notes TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'draft'
                        CHECK(status IN ('draft', 'confirmed', 'closed')),
                    created_by INTEGER REFERENCES users(id),
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS purchase_order_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    po_id INTEGER NOT NULL
                        REFERENCES purchase_orders(id) ON DELETE CASCADE,
                    sr_no INTEGER NOT NULL,
                    part_number TEXT NOT NULL DEFAULT '',
                    description TEXT NOT NULL DEFAULT '',
                    quantity REAL NOT NULL DEFAULT 1.0,
                    unit TEXT NOT NULL DEFAULT 'NOS',
                    unit_price REAL NOT NULL DEFAULT 0.0,
                    total_amount REAL NOT NULL DEFAULT 0.0
                );

                CREATE INDEX IF NOT EXISTS idx_po_items_po_id
                    ON purchase_order_items(po_id);
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "po_replace_supplier_with_customer",
            // Links each PO to customers(id); name/address are denormalized snapshots at save time.
            sql: r#"
                ALTER TABLE purchase_orders ADD COLUMN customer_id INTEGER REFERENCES customers(id);
                ALTER TABLE purchase_orders ADD COLUMN customer_name TEXT NOT NULL DEFAULT '';
                ALTER TABLE purchase_orders ADD COLUMN customer_address TEXT NOT NULL DEFAULT '';
                ALTER TABLE purchase_orders DROP COLUMN supplier_id;
                ALTER TABLE purchase_orders DROP COLUMN supplier_name;
                ALTER TABLE purchase_orders DROP COLUMN supplier_address;
                ALTER TABLE purchase_orders DROP COLUMN supplier_gstin;
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "add_purchase_order_id_to_invoices",
            // Optional FK for a future invoice-from-PO flow; not used by the PO entry UI.
            sql: r#"
                ALTER TABLE invoices ADD COLUMN purchase_order_id INTEGER REFERENCES purchase_orders(id);
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "add_customer_po_no_to_purchase_orders",
            // Customer's own PO number (as on their document), separate from internal po_number sequence.
            sql: r#"
                ALTER TABLE purchase_orders ADD COLUMN customer_po_no TEXT NOT NULL DEFAULT '';
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "add_incoterm_to_invoices",
            // Incoterms 2020 delivery term selected per invoice (e.g. EXW, FOB, CIF).
            sql: r#"
                ALTER TABLE invoices ADD COLUMN incoterm TEXT NOT NULL DEFAULT '';
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 14,
            description: "add_dimensions_unit_to_invoice_items",
            // Per-line packing dimensions unit (MM, CM, INCH). Empty for legacy rows.
            sql: r#"
                ALTER TABLE invoice_items ADD COLUMN dimensions_unit TEXT NOT NULL DEFAULT '';
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 15,
            description: "add_sa_number_to_item_tables",
            // Shipping advice / SA reference number per line item, on both PO and invoice items.
            sql: r#"
                ALTER TABLE purchase_order_items ADD COLUMN sa_number TEXT NOT NULL DEFAULT '';
                ALTER TABLE invoice_items ADD COLUMN sa_number TEXT NOT NULL DEFAULT '';
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 16,
            description: "add_show_sa_number_to_orders_and_invoices",
            // Per-document flag controlling SA Number column visibility in outputs.
            sql: r#"
                ALTER TABLE purchase_orders ADD COLUMN show_sa_number BOOLEAN NOT NULL DEFAULT TRUE;
                ALTER TABLE invoices ADD COLUMN show_sa_number BOOLEAN NOT NULL DEFAULT TRUE;
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 17,
            description: "add_packing_list_to_invoices",
            // Stores per-invoice packing list rows as a JSON array; '[]' for invoices without packing data.
            sql: r#"
                ALTER TABLE invoices ADD COLUMN packing_list TEXT NOT NULL DEFAULT '[]';
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 18,
            description: "add_company_logo_to_settings",
            // Base64-encoded company logo image; empty string means no logo set.
            sql: r#"
                ALTER TABLE company_settings ADD COLUMN company_logo_base64 TEXT NOT NULL DEFAULT '';
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 19,
            description: "add_port_and_destination_to_purchase_orders",
            // PO-level delivery override for invoices; falls back to buyer if empty.
            // When non-empty these values take precedence over the customer master defaults
            // during mapPurchaseOrderToInvoiceFields, letting a single PO target a port
            // or final destination that differs from the buyer's usual shipping lane.
            sql: r#"
                ALTER TABLE purchase_orders ADD COLUMN port_of_discharge TEXT NOT NULL DEFAULT '';
                ALTER TABLE purchase_orders ADD COLUMN final_destination TEXT NOT NULL DEFAULT '';
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 20,
            description: "create_entries",
            // Consolidated export entry: optional links to a customer, invoice and PO,
            // denormalized snapshots of their key fields at entry time, plus the manual
            // export/shipping fields (shipping bill, BL/AWB, EGM, FOB/freight/insurance,
            // container, weights) that are not captured by any existing module.
            sql: r#"
                CREATE TABLE IF NOT EXISTS entries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,

                    customer_id INTEGER REFERENCES customers(id),
                    invoice_id INTEGER REFERENCES invoices(id),
                    purchase_order_id INTEGER REFERENCES purchase_orders(id),

                    customer_name TEXT NOT NULL DEFAULT '',
                    customer_address TEXT NOT NULL DEFAULT '',
                    invoice_number TEXT NOT NULL DEFAULT '',
                    invoice_date TEXT NOT NULL DEFAULT '',
                    po_number TEXT NOT NULL DEFAULT '',
                    customer_po_no TEXT NOT NULL DEFAULT '',
                    currency TEXT NOT NULL DEFAULT 'USD',
                    exchange_rate REAL NOT NULL DEFAULT 1.0,

                    shipping_bill_no TEXT NOT NULL DEFAULT '',
                    shipping_bill_date TEXT NOT NULL DEFAULT '',
                    bl_awb_no TEXT NOT NULL DEFAULT '',
                    bl_awb_date TEXT NOT NULL DEFAULT '',
                    vessel_flight_no TEXT NOT NULL DEFAULT '',
                    container_no TEXT NOT NULL DEFAULT '',
                    transport_mode TEXT NOT NULL DEFAULT 'BY SEA',
                    port_of_loading TEXT NOT NULL DEFAULT '',
                    port_of_discharge TEXT NOT NULL DEFAULT '',
                    final_destination TEXT NOT NULL DEFAULT '',
                    egm_no TEXT NOT NULL DEFAULT '',
                    egm_date TEXT NOT NULL DEFAULT '',
                    fob_value REAL NOT NULL DEFAULT 0.0,
                    freight REAL NOT NULL DEFAULT 0.0,
                    insurance REAL NOT NULL DEFAULT 0.0,
                    net_weight TEXT NOT NULL DEFAULT '',
                    gross_weight TEXT NOT NULL DEFAULT '',
                    no_of_packages TEXT NOT NULL DEFAULT '',
                    marks_nos TEXT NOT NULL DEFAULT '',
                    remarks TEXT NOT NULL DEFAULT '',

                    status TEXT NOT NULL DEFAULT 'draft'
                        CHECK(status IN ('draft', 'final')),
                    created_by INTEGER REFERENCES users(id),
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                CREATE INDEX IF NOT EXISTS idx_entries_customer_id
                    ON entries(customer_id);
                CREATE INDEX IF NOT EXISTS idx_entries_invoice_id
                    ON entries(invoice_id);
                CREATE INDEX IF NOT EXISTS idx_entries_purchase_order_id
                    ON entries(purchase_order_id);
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 21,
            description: "add_entry_form_fields",
            // Fields the Entry form auto-fills from the selected invoice/PO (po_date,
            // invoice_total, line-item snapshot) plus the manual local-invoice pair.
            // Appended rather than folded into migration 20 so DBs that already ran 20
            // pick the columns up cleanly.
            sql: r#"
                ALTER TABLE entries ADD COLUMN po_date TEXT NOT NULL DEFAULT '';
                ALTER TABLE entries ADD COLUMN local_invoice_no TEXT NOT NULL DEFAULT '';
                ALTER TABLE entries ADD COLUMN local_invoice_date TEXT NOT NULL DEFAULT '';
                ALTER TABLE entries ADD COLUMN invoice_total REAL NOT NULL DEFAULT 0.0;
                ALTER TABLE entries ADD COLUMN items TEXT NOT NULL DEFAULT '[]';
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 22,
            description: "add_customer_name_unique_index",
            // Enforce case-insensitive name uniqueness at the DB level.
            // Step 1: deduplicate in place — keep the first (lowest id) occurrence;
            // append ' (id)' to any later duplicate so the unique index can be created
            // safely on DBs that already have duplicate names.
            // Step 2: create the unique index.
            sql: r#"
                UPDATE customers
                SET name = name || ' (' || id || ')'
                WHERE id NOT IN (
                    SELECT MIN(id) FROM customers GROUP BY LOWER(TRIM(name))
                );
                CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_name_ci
                ON customers(LOWER(TRIM(name)));
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 23,
            description: "add_login_lockout_to_users",
            sql: r#"
                ALTER TABLE users ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE users ADD COLUMN locked_until TEXT DEFAULT NULL;
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 24,
            description: "create_auth_audit_log",
            // Append-only table; no UPDATE/DELETE in app flow.
            // ip_or_source is a fixed tag for desktop ("tauri-main-window").
            sql: r#"
                CREATE TABLE IF NOT EXISTS auth_audit_log (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id      INTEGER NULL,
                    event_type   TEXT    NOT NULL
                                     CHECK(event_type IN (
                                         'failed_attempt','locked','unlocked',
                                         'pin_changed','login_success'
                                     )),
                    occurred_at  TEXT    NOT NULL DEFAULT (datetime('now')),
                    ip_or_source TEXT    DEFAULT 'tauri-main-window',
                    details_json TEXT    NOT NULL DEFAULT '{}',
                    created_by   INTEGER NULL
                );
                CREATE INDEX IF NOT EXISTS idx_auth_audit_user_time
                    ON auth_audit_log(user_id, occurred_at DESC);
                CREATE INDEX IF NOT EXISTS idx_auth_audit_event_time
                    ON auth_audit_log(event_type, occurred_at DESC);
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 25,
            description: "add_hash_chain_to_auth_audit_log",
            // prev_hash: entry_hash of the immediately preceding row ('' for first row).
            // entry_hash: SHA-256(prev_hash|event_type|user_id|occurred_at|details_json).
            // Existing rows get empty defaults — treated as pre-chain legacy by verify_audit_chain.
            sql: r#"
                ALTER TABLE auth_audit_log ADD COLUMN prev_hash  TEXT NOT NULL DEFAULT '';
                ALTER TABLE auth_audit_log ADD COLUMN entry_hash TEXT NOT NULL DEFAULT '';
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 26,
            description: "create_security_event_log",
            // Records backend-denied IPC commands. Append-only — never UPDATE/DELETE in app code.
            sql: r#"
                CREATE TABLE IF NOT EXISTS security_event_log (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    command     TEXT    NOT NULL,
                    user_id     INTEGER NULL,
                    reason      TEXT    NOT NULL,
                    occurred_at TEXT    NOT NULL DEFAULT (datetime('now'))
                );
                CREATE INDEX IF NOT EXISTS idx_security_event_time
                    ON security_event_log(occurred_at DESC);
                CREATE INDEX IF NOT EXISTS idx_security_event_command
                    ON security_event_log(command, occurred_at DESC);
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 27,
            description: "add_row_version_to_mutable_tables",
            // Optimistic locking: every update command checks AND increments row_version.
            // Existing rows get DEFAULT 1; the frontend reads row_version on load and echoes
            // it back as expected_row_version. A mismatch means another session wrote first.
            sql: r#"
                ALTER TABLE invoices        ADD COLUMN row_version INTEGER NOT NULL DEFAULT 1;
                ALTER TABLE purchase_orders ADD COLUMN row_version INTEGER NOT NULL DEFAULT 1;
                ALTER TABLE entries         ADD COLUMN row_version INTEGER NOT NULL DEFAULT 1;
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 28,
            description: "create_activity_log",
            sql: r#"
                CREATE TABLE IF NOT EXISTS activity_log (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id     INTEGER REFERENCES users(id),
                    user_name   TEXT    NOT NULL DEFAULT '',
                    action      TEXT    NOT NULL,
                    module      TEXT    NOT NULL,
                    record_ref  TEXT    NOT NULL DEFAULT '',
                    details     TEXT    NOT NULL DEFAULT '',
                    occurred_at TEXT    NOT NULL DEFAULT (datetime('now'))
                );
                CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id);
                CREATE INDEX IF NOT EXISTS idx_activity_log_time ON activity_log(occurred_at);
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 29,
            description: "create_system_agent_settings",
            sql: r#"
                CREATE TABLE IF NOT EXISTS system_agent_settings (
                    id                INTEGER PRIMARY KEY DEFAULT 1,
                    enabled           BOOLEAN NOT NULL DEFAULT FALSE,
                    task_interval_sec INTEGER NOT NULL DEFAULT 300,
                    last_run_at       TEXT    DEFAULT NULL,
                    notes             TEXT    NOT NULL DEFAULT ''
                );
                INSERT OR IGNORE INTO system_agent_settings (id) VALUES (1);
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 30,
            description: "create_automation_tasks",
            sql: r#"
                CREATE TABLE IF NOT EXISTS automation_tasks (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_name   TEXT    NOT NULL,
                    status      TEXT    NOT NULL DEFAULT 'pending'
                                CHECK(status IN ('pending','running','completed','failed')),
                    duration_ms INTEGER NOT NULL DEFAULT 0,
                    ran_at      TEXT    NOT NULL DEFAULT (datetime('now')),
                    details     TEXT    NOT NULL DEFAULT ''
                );
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 31,
            description: "create_incidents",
            sql: r#"
                CREATE TABLE IF NOT EXISTS incidents (
                    id               INTEGER PRIMARY KEY AUTOINCREMENT,
                    severity         TEXT NOT NULL DEFAULT 'INFO'
                                     CHECK(severity IN ('INFO','WARNING','CRITICAL','FATAL')),
                    status           TEXT NOT NULL DEFAULT 'active'
                                     CHECK(status IN ('active','resolved','suppressed')),
                    description      TEXT NOT NULL,
                    resolution_notes TEXT NOT NULL DEFAULT '',
                    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
                    resolved_at      TEXT DEFAULT NULL
                );
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 32,
            description: "create_role_permissions",
            // Per-role permission grants for operator and viewer.
            // Admin permissions are always the full set and are never stored here.
            // Seeded with defaults matching the previous hardcoded matrix.
            sql: r#"
                CREATE TABLE IF NOT EXISTS role_permissions (
                    role        TEXT NOT NULL CHECK(role IN ('operator', 'viewer')),
                    permission  TEXT NOT NULL,
                    granted     INTEGER NOT NULL DEFAULT 1
                                CHECK(granted IN (0, 1)),
                    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_by  INTEGER REFERENCES users(id),
                    PRIMARY KEY (role, permission)
                );

                INSERT OR IGNORE INTO role_permissions (role, permission, granted) VALUES
                    ('operator', 'view_invoices',   1),
                    ('operator', 'export_invoice',  1),
                    ('operator', 'create_invoice',  1),
                    ('operator', 'edit_invoice',    1),
                    ('viewer',   'view_invoices',   1),
                    ('viewer',   'export_invoice',  1),
                    ('viewer',   'create_invoice',  0),
                    ('viewer',   'edit_invoice',    0);
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 33,
            description: "seed_previously_admin_only_permissions",
            // Seeds the six permissions that were previously hardcoded admin-only.
            // All default to granted=0 so existing behaviour is preserved until
            // an admin explicitly grants them via the Roles & Permissions page.
            sql: r#"
                INSERT OR IGNORE INTO role_permissions (role, permission, granted) VALUES
                    ('operator', 'finalize_invoice',  0),
                    ('operator', 'delete_invoice',    0),
                    ('operator', 'edit_final_invoice',0),
                    ('operator', 'edit_confirmed_po', 0),
                    ('operator', 'manage_users',      0),
                    ('operator', 'access_settings',   0),
                    ('viewer',   'finalize_invoice',  0),
                    ('viewer',   'delete_invoice',    0),
                    ('viewer',   'edit_final_invoice',0),
                    ('viewer',   'edit_confirmed_po', 0),
                    ('viewer',   'manage_users',      0),
                    ('viewer',   'access_settings',   0);
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 34,
            description: "add_list_query_indexes",
            // Speed up common list/filter queries. activity_log(occurred_at) already
            // has idx_activity_log_time from migration 28 — IF NOT EXISTS is a no-op.
            sql: r#"
                CREATE INDEX IF NOT EXISTS idx_invoices_invoice_date ON invoices(invoice_date);
                CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
                CREATE INDEX IF NOT EXISTS idx_purchase_orders_customer_id ON purchase_orders(customer_id);
                CREATE INDEX IF NOT EXISTS idx_activity_log_time ON activity_log(occurred_at);
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 35,
            description: "add_fiscal_year_to_company_settings",
            // Empty string = auto-derive from invoice date (April–March boundary).
            // Non-empty (e.g. "2025-26") locks all new invoice numbers to that FY.
            sql: r#"
                ALTER TABLE company_settings ADD COLUMN fiscal_year TEXT NOT NULL DEFAULT '';
            "#,
            kind: MigrationKind::Up,
        },
    ]
}

/// Admin Center tables (migrations 28–31). Idempotent — safe when the plugin already applied them.
const ADMIN_MODULE_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS activity_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER REFERENCES users(id),
    user_name   TEXT    NOT NULL DEFAULT '',
    action      TEXT    NOT NULL,
    module      TEXT    NOT NULL,
    record_ref  TEXT    NOT NULL DEFAULT '',
    details     TEXT    NOT NULL DEFAULT '',
    occurred_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_time ON activity_log(occurred_at);

CREATE TABLE IF NOT EXISTS system_agent_settings (
    id                INTEGER PRIMARY KEY DEFAULT 1,
    enabled           BOOLEAN NOT NULL DEFAULT FALSE,
    task_interval_sec INTEGER NOT NULL DEFAULT 300,
    last_run_at       TEXT    DEFAULT NULL,
    notes             TEXT    NOT NULL DEFAULT ''
);
INSERT OR IGNORE INTO system_agent_settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS automation_tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    task_name   TEXT    NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'pending'
                CHECK(status IN ('pending','running','completed','failed')),
    duration_ms INTEGER NOT NULL DEFAULT 0,
    ran_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    details     TEXT    NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS incidents (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    severity         TEXT NOT NULL DEFAULT 'INFO'
                     CHECK(severity IN ('INFO','WARNING','CRITICAL','FATAL')),
    status           TEXT NOT NULL DEFAULT 'active'
                     CHECK(status IN ('active','resolved','suppressed')),
    description      TEXT NOT NULL,
    resolution_notes TEXT NOT NULL DEFAULT '',
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at      TEXT DEFAULT NULL
);
"#;

/// Ensures Admin Center tables exist. Called from Rust `AppDb` on every first open.
pub fn ensure_admin_module_schema(conn: &rusqlite::Connection) -> Result<(), String> {
    conn.execute_batch(ADMIN_MODULE_SQL)
        .map_err(|e| format!("Admin schema init: {e}"))
}

fn migration_table_max_version(conn: &rusqlite::Connection) -> Option<i64> {
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='_sqlx_migrations'",
            [],
            |r| r.get::<_, i64>(0),
        )
        .unwrap_or(0)
        > 0;
    if !exists {
        return None;
    }
    conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM _sqlx_migrations WHERE success=1",
        [],
        |r| r.get(0),
    )
    .ok()
}

/// Applies plugin migrations that are registered in `_sqlx_migrations` but not yet run.
/// Keeps the Rust rusqlite connection aligned with tauri-plugin-sql on the same file.
pub fn sync_pending_plugin_migrations(conn: &rusqlite::Connection) -> Result<(), String> {
    let Some(applied_max) = migration_table_max_version(conn) else {
        return ensure_admin_module_schema(conn);
    };

    let target_max = get_migrations()
        .iter()
        .map(|m| m.version)
        .max()
        .unwrap_or(0);

    if applied_max < target_max {
        for m in get_migrations() {
            if m.version > applied_max {
                if let Err(e) = conn.execute_batch(m.sql) {
                    let msg = e.to_string();
                    // "duplicate column name" means a prior safety-net DDL already added
                    // the column — the migration's intent is satisfied, treat as success.
                    if !msg.contains("duplicate column name") {
                        return Err(format!("Migration v{} ({}): {e}", m.version, m.description));
                    }
                    eprintln!(
                        "[migration] v{} ({}) column already present — marking applied",
                        m.version, m.description
                    );
                }
                let _ = conn.execute(
                    "INSERT OR IGNORE INTO _sqlx_migrations \
                     (version, description, success, checksum, execution_time) \
                     VALUES (?1, ?2, 1, X'00', 0)",
                    rusqlite::params![m.version, m.description],
                );
            }
        }
    }

    ensure_admin_module_schema(conn)
}

// ── migration regression tests ────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    /// Apply every migration in sequence on a fresh in-memory DB and verify that
    /// columns added in migrations 24–27 are present.  Catches schema drift early.
    #[test]
    fn all_migrations_apply_cleanly() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();

        for m in super::get_migrations() {
            conn.execute_batch(m.sql).unwrap_or_else(|e| {
                panic!("Migration {} ({}) failed: {e}", m.version, m.description)
            });
        }

        // Migration 24: auth_audit_log
        let cols: Vec<String> = conn
            .prepare("PRAGMA table_info(auth_audit_log)").unwrap()
            .query_map([], |r| r.get::<_, String>(1)).unwrap()
            .map(|r| r.unwrap()).collect();
        assert!(cols.contains(&"event_type".into()), "auth_audit_log missing event_type");
        assert!(cols.contains(&"details_json".into()), "auth_audit_log missing details_json");

        // Migration 25: hash chain columns
        assert!(cols.contains(&"prev_hash".into()), "auth_audit_log missing prev_hash");
        assert!(cols.contains(&"entry_hash".into()), "auth_audit_log missing entry_hash");

        // Migration 26: security_event_log
        let sec: Vec<String> = conn
            .prepare("PRAGMA table_info(security_event_log)").unwrap()
            .query_map([], |r| r.get::<_, String>(1)).unwrap()
            .map(|r| r.unwrap()).collect();
        assert!(sec.contains(&"command".into()), "security_event_log missing command");
        assert!(sec.contains(&"reason".into()),  "security_event_log missing reason");

        // Migration 27: row_version on all mutable tables
        for table in ["invoices", "purchase_orders", "entries"] {
            let tc: Vec<String> = conn
                .prepare(&format!("PRAGMA table_info({table})")).unwrap()
                .query_map([], |r| r.get::<_, String>(1)).unwrap()
                .map(|r| r.unwrap()).collect();
            assert!(tc.contains(&"row_version".into()), "{table} missing row_version");
        }

        // Migration 28: activity_log
        let al: Vec<String> = conn
            .prepare("PRAGMA table_info(activity_log)").unwrap()
            .query_map([], |r| r.get::<_, String>(1)).unwrap()
            .map(|r| r.unwrap()).collect();
        assert!(al.contains(&"action".into()),      "activity_log missing action");
        assert!(al.contains(&"module".into()),      "activity_log missing module");
        assert!(al.contains(&"occurred_at".into()), "activity_log missing occurred_at");

        // Migration 29: system_agent_settings (seed row must exist)
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM system_agent_settings", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1, "system_agent_settings seed row missing");

        // Migration 30: automation_tasks
        let at: Vec<String> = conn
            .prepare("PRAGMA table_info(automation_tasks)").unwrap()
            .query_map([], |r| r.get::<_, String>(1)).unwrap()
            .map(|r| r.unwrap()).collect();
        assert!(at.contains(&"task_name".into()), "automation_tasks missing task_name");
        assert!(at.contains(&"status".into()),    "automation_tasks missing status");

        // Migration 31: incidents
        let inc: Vec<String> = conn
            .prepare("PRAGMA table_info(incidents)").unwrap()
            .query_map([], |r| r.get::<_, String>(1)).unwrap()
            .map(|r| r.unwrap()).collect();
        assert!(inc.contains(&"severity".into()),    "incidents missing severity");
        assert!(inc.contains(&"resolved_at".into()), "incidents missing resolved_at");

        // Migration 32: role_permissions table + seed rows
        let rp: Vec<String> = conn
            .prepare("PRAGMA table_info(role_permissions)").unwrap()
            .query_map([], |r| r.get::<_, String>(1)).unwrap()
            .map(|r| r.unwrap()).collect();
        assert!(rp.contains(&"role".into()),       "role_permissions missing role");
        assert!(rp.contains(&"permission".into()), "role_permissions missing permission");
        assert!(rp.contains(&"granted".into()),    "role_permissions missing granted");

        let op_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM role_permissions WHERE role='operator'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(op_count, 10, "operator seed rows missing");

        let vw_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM role_permissions WHERE role='viewer'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(vw_count, 10, "viewer seed rows missing");

        // Migration 33: previously-admin-only permissions seeded with granted=0
        let new_perms = ["finalize_invoice", "delete_invoice", "edit_final_invoice",
                         "edit_confirmed_po", "manage_users", "access_settings"];
        for perm in new_perms {
            for role in ["operator", "viewer"] {
                let granted: i64 = conn
                    .query_row(
                        "SELECT granted FROM role_permissions WHERE role=?1 AND permission=?2",
                        rusqlite::params![role, perm],
                        |r| r.get(0),
                    )
                    .unwrap_or(-1);
                assert_eq!(granted, 0, "{role}:{perm} should default to granted=0");
            }
        }
    }
}
