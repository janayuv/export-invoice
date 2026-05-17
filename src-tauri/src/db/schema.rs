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
    ]
}
