# Export Invoice — Definitive System Blueprint

> **Purpose:** Single-source-of-truth reference for rebuilding, validating, or extending this application. Every field, type, rule, and algorithm is documented explicitly — no placeholders.

---

## AGENT GUIDELINES — RECENT IMPLEMENTATION (2025)

Use this block when extending invoice/PO flows or export layouts.

### 1. What changed

- **Dual PO numbering:** Internal `po_number` (`PO/{seq}/{FY}`) is app-generated; `customer_po_no` is the number on the customer's document and becomes invoice `buyer_order_no` when loading from a PO.
- **Invoice ↔ PO link:** `invoices.purchase_order_id` (migration 11) is set from the invoice form; create/edit UI picks a customer, then a PO via `getPurchaseOrdersByCustomerId()`, then applies `mapPurchaseOrderToInvoiceFields()`.
- **Shared document layer:** `src/lib/invoiceDocument.ts` centralizes reference-row labels/values, `DD.MM.YYYY` display dates, `fmtAmount`, and `amountInWords` for HTML preview, PDF, and Excel.
- **Export layout refresh:** `InvoicePreview`, `PdfDocument`, and `excel.ts` share the same header reference order and packing-list grid (black borders, consignee + shipping left / buyer + countries + terms right, `EX WORK {currency}` rate columns).
- **PO persistence:** `normalizePOFormValues()` trims text and recomputes line totals before INSERT/UPDATE; PO forms validate with `poFormSchema` / `poItemSchema` in `schemas.ts`.
- **Build:** Tauri `bundle.targets` is `["msi", "nsis"]` (Windows installers only).

### 2. Files affected

| Area | Paths |
|---|---|
| Schema | `src-tauri/src/db/schema.rs` (migrations 11–12) |
| PO CRUD | `src/hooks/usePurchaseOrders.ts` |
| Invoice CRUD | `src/hooks/useInvoices.ts` |
| PO → invoice mapping | `src/lib/invoiceFromPo.ts` |
| Validation | `src/lib/schemas.ts`, `src/lib/types.ts` |
| Invoice form UI | `src/routes/InvoiceNew.tsx` |
| PO UI | `src/routes/PurchaseOrderNew.tsx`, `PurchaseOrderList.tsx`, `PurchaseOrderDetail.tsx` |
| Exports | `src/lib/invoiceDocument.ts`, `src/lib/excel.ts`, `src/components/InvoicePreview/index.tsx`, `PdfDocument.tsx` |
| Config | `src-tauri/tauri.conf.json` |

### 3. Patterns to follow

- **Invoice outputs:** Import `invoiceReferenceRows`, `formatInvoiceDisplayDate`, `amountInWords`, and `fmtAmount` from `@/lib/invoiceDocument` — do not reimplement reference rows or date formatting per format.
- **Pre-fill from PO:** Call `mapPurchaseOrderToInvoiceFields(po, customer)`; persist `purchase_order_id` and mapped `buyer_order_no` via `createInvoice` / `updateInvoice`.
- **PO picker:** `getPurchaseOrdersByCustomerId(customerId)` → `PurchaseOrderSummary[]`; PO select value `__none__` (`PO_SELECT_NONE`) means no linked PO.
- **PO saves:** Run `normalizePOFormValues(data)` inside `createPurchaseOrder` / `updatePurchaseOrder` (already wired); validate UI with `poFormSchema.safeParse` before save.
- **Edit invoice pickers:** Load form once (`editFormLoadedRef`); sync customer/PO comboboxes after customers load using `purchase_order_id` + `getPurchaseOrder` (see `InvoiceNew.tsx`).

### 4. Deprecated patterns (avoid)

- Putting the customer's PO number in `po_number` or deriving `buyer_order_no` from the internal `PO/…` sequence.
- Duplicating header fields (invoice no, buyer's order, LUT, HS code, etc.) in PdfDocument, InvoicePreview, or excel.ts instead of `invoiceReferenceRows()`.
- Implementing `amountInWords` in `excel.ts` (moved to `invoiceDocument.ts`).
- Updating source PO line quantities when the user edits qty on a saved invoice (invoice items only).
- Resetting the full invoice form on every customer-list refresh during edit mode.

---

## SECTION 1: SYSTEM OVERVIEW & ARCHITECTURE

### What the Application Does

**Export Invoice** is a Windows desktop application for Indian exporters to create, manage, and export commercial export invoices and purchase orders. It targets compliance with Indian customs/DGFT requirements: it stores LUT/ARN references, IEC, GSTIN, HS codes, duty drawback references, and generates invoice-cum-packing-list documents suitable for submission to shipping lines and customs authorities.

Core capabilities:
- Create and finalize export invoices with full shipping metadata
- Generate **Invoice-cum-Packing List** PDFs (A4, ready to print)
- Export invoices to Excel (.xlsx)
- Manage purchase orders tied to customer master records
- Role-based access control (admin / operator / viewer) with PIN authentication
- SQLite-backed persistence — fully offline, no cloud dependency

### Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Desktop shell | Tauri | 2.0 |
| UI framework | React | 19 |
| Language | TypeScript | 5.8 |
| Build tool | Vite | 7 |
| Styling | Tailwind CSS | 3.4 |
| Routing | React Router | 6 |
| Form management | React Hook Form | latest |
| Validation | Zod | latest |
| PDF generation | @react-pdf/renderer | latest |
| Excel generation | xlsx (SheetJS) | latest |
| Database | SQLite via tauri-plugin-sql | 2.4.0 |
| File I/O | tauri-plugin-fs | 2.5.1 |
| File dialogs | tauri-plugin-dialog | 2.7.1 |
| UI primitives | shadcn/ui + Base UI | latest |
| Icons | Lucide React | latest |
| Notifications | Sonner (toast) | latest |
| Backend language | Rust | stable |

### Repository Layout

```
D:\Export-Invoice/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
├── components.json               # shadcn/ui configuration
├── src/
│   ├── main.tsx                  # React entry point
│   ├── App.tsx                   # Router + AuthProvider root
│   ├── index.css                 # Tailwind directives + global styles
│   ├── components/
│   │   ├── InvoicePreview/
│   │   │   ├── index.tsx         # HTML screen preview component
│   │   │   └── PdfDocument.tsx   # @react-pdf/renderer PDF layout
│   │   ├── LineItemsTable/
│   │   │   └── index.tsx         # Dynamic line items with auto-totals
│   │   ├── layout/
│   │   │   └── Layout.tsx        # App shell (sidebar + content)
│   │   └── ui/                   # shadcn/ui primitives
│   ├── contexts/
│   │   └── AuthContext.tsx       # Session + permission management
│   ├── hooks/
│   │   ├── useInvoices.ts        # Invoice CRUD + list hook
│   │   ├── usePurchaseOrders.ts  # PO CRUD + list hook
│   │   └── useSettings.ts       # Company settings hook
│   ├── lib/
│   │   ├── auth.ts               # PIN hashing, user queries, permissions
│   │   ├── customer.ts           # Customer master CRUD (+ Customer types)
│   │   ├── db.ts                 # SQLite singleton connection
│   │   ├── excel.ts              # xlsx export (uses invoiceDocument helpers)
│   │   ├── invoiceDocument.ts    # Shared refs, dates, fmtAmount, amountInWords
│   │   ├── invoiceFromPo.ts      # PO → invoice field mapping
│   │   ├── pdf.ts                # PDF export via @react-pdf/renderer
│   │   ├── schemas.ts            # Zod schemas (company, invoice, PO)
│   │   ├── types.ts              # Invoice + company types
│   │   └── utils.ts              # cn() classname helper
│   └── routes/
│       ├── LoginScreen.tsx
│       ├── SetupAdmin.tsx
│       ├── Dashboard.tsx
│       ├── InvoiceList.tsx
│       ├── InvoiceNew.tsx
│       ├── InvoiceDetail.tsx
│       ├── PurchaseOrderList.tsx
│       ├── PurchaseOrderNew.tsx
│       ├── PurchaseOrderDetail.tsx
│       ├── Settings.tsx
│       ├── CustomerManagement.tsx
│       └── UserManagement.tsx
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── capabilities/
    │   └── default.json
    └── src/
        ├── main.rs
        ├── lib.rs
        ├── commands/
        │   ├── mod.rs
        │   └── invoice.rs        # Custom Tauri commands (currently unused)
        └── db/
            ├── mod.rs
            └── schema.rs         # 12 SQL migration definitions
```

---

## SECTION 2: DATA STRUCTURES & SCHEMAS

### 2.1 Database Schema (SQLite)

All tables are created via numbered Rust migrations in `src-tauri/src/db/schema.rs`. Migrations are applied in order at application startup via `tauri-plugin-sql`.

#### Table: `company_settings` (Exporter / Seller Details)

Stores a single row (`id = 1`) for the exporter's profile.

```sql
CREATE TABLE IF NOT EXISTS company_settings (
  id               INTEGER PRIMARY KEY,
  name             TEXT    DEFAULT '',
  address          TEXT    DEFAULT '',
  gstin            TEXT    DEFAULT '',
  pan              TEXT    DEFAULT '',
  iec              TEXT    DEFAULT '',
  bank_name        TEXT    DEFAULT '',
  bank_account     TEXT    DEFAULT '',
  ifsc             TEXT    DEFAULT '',
  swift            TEXT    DEFAULT '',
  bank_ad_code     TEXT    DEFAULT '',
  lut_arn_no       TEXT    DEFAULT '',
  lut_arn_date     TEXT    DEFAULT '',
  place            TEXT    DEFAULT '',
  signatory_name   TEXT    DEFAULT '',
  created_at       TEXT    DEFAULT (datetime('now')),
  updated_at       TEXT    DEFAULT (datetime('now'))
);
```

#### Table: `invoices`

```sql
CREATE TABLE IF NOT EXISTS invoices (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number          TEXT    NOT NULL UNIQUE,
  invoice_date            TEXT    NOT NULL,
  transport_mode          TEXT    DEFAULT 'BY SEA',
  buyer_order_no          TEXT    DEFAULT '',
  duty_drawback           TEXT    DEFAULT '',
  hs_code                 TEXT    DEFAULT '',
  other_references        TEXT    DEFAULT '',
  consignee_name          TEXT    DEFAULT '',
  consignee_address       TEXT    DEFAULT '',
  buyer_if_other          TEXT    DEFAULT '',
  country_of_origin       TEXT    DEFAULT 'INDIA',
  country_of_destination  TEXT    DEFAULT '',
  pre_carriage_by         TEXT    DEFAULT '',
  place_of_receipt        TEXT    DEFAULT '',
  pre_carrier             TEXT    DEFAULT '',
  vessel                  TEXT    DEFAULT '',
  port_of_loading         TEXT    DEFAULT '',
  port_of_discharge       TEXT    DEFAULT '',
  final_destination       TEXT    DEFAULT '',
  terms_of_payment        TEXT    DEFAULT '',
  currency                TEXT    DEFAULT 'USD',
  exchange_rate           REAL    DEFAULT 1.0,
  net_weight              TEXT    DEFAULT '',
  gross_weight            TEXT    DEFAULT '',
  notes                   TEXT    DEFAULT '',
  status                  TEXT    DEFAULT 'draft'
                          CHECK(status IN ('draft', 'final')),
  purchase_order_id       INTEGER REFERENCES purchase_orders(id),
  created_by              INTEGER REFERENCES users(id),
  finalized_by            INTEGER REFERENCES users(id),
  created_at              TEXT    DEFAULT (datetime('now')),
  updated_at              TEXT    DEFAULT (datetime('now'))
);
```

#### Table: `invoice_items`

```sql
CREATE TABLE IF NOT EXISTS invoice_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id    INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  sr_no         INTEGER NOT NULL,
  marks_nos     TEXT    DEFAULT '',
  no_of_pkgs    TEXT    DEFAULT '',
  dimensions    TEXT    DEFAULT '',
  part_number   TEXT    DEFAULT '',
  description   TEXT    DEFAULT '',
  quantity      REAL    DEFAULT 1.0,
  unit          TEXT    DEFAULT 'NOS',
  unit_price    REAL    DEFAULT 0.0,
  total_amount  REAL    DEFAULT 0.0
);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
```

#### Table: `invoice_sequence`

```sql
CREATE TABLE IF NOT EXISTS invoice_sequence (
  year         INTEGER PRIMARY KEY,
  last_number  INTEGER DEFAULT 0
);
```

#### Table: `users`

```sql
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  pin_hash    TEXT    NOT NULL,
  role        TEXT    DEFAULT 'viewer'
              CHECK(role IN ('admin', 'operator', 'viewer')),
  is_active   INTEGER DEFAULT 1,
  created_at  TEXT    DEFAULT (datetime('now')),
  updated_at  TEXT    DEFAULT (datetime('now'))
);
```

#### Table: `customers`

```sql
CREATE TABLE IF NOT EXISTS customers (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  name                    TEXT    NOT NULL,
  address                 TEXT    DEFAULT '',
  country_of_destination  TEXT    DEFAULT '',
  port_of_discharge       TEXT    DEFAULT '',
  final_destination       TEXT    DEFAULT '',
  currency                TEXT    DEFAULT 'USD',
  pre_carriage_by         TEXT    DEFAULT 'BY ROAD',
  place_of_receipt        TEXT    DEFAULT 'CHENNAI',
  pre_carrier             TEXT    DEFAULT 'CHENNAI',
  port_of_loading         TEXT    DEFAULT 'CHENNAI',
  created_at              TEXT    DEFAULT (datetime('now')),
  updated_at              TEXT    DEFAULT (datetime('now'))
);
```

#### Table: `purchase_orders`

```sql
CREATE TABLE IF NOT EXISTS purchase_orders (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  po_number        TEXT    NOT NULL UNIQUE,
  po_date          TEXT    NOT NULL,
  customer_id      INTEGER REFERENCES customers(id),
  customer_name    TEXT    DEFAULT '',
  customer_address TEXT    DEFAULT '',
  customer_po_no   TEXT    DEFAULT '',   -- Customer's PO number (as on their document)
  delivery_date    TEXT    DEFAULT '',   -- PO expiry date in the UI
  delivery_address TEXT    DEFAULT '',
  payment_terms    TEXT    DEFAULT '',
  currency         TEXT    DEFAULT 'INR',
  exchange_rate    REAL    DEFAULT 1.0,
  notes            TEXT    DEFAULT '',
  status           TEXT    DEFAULT 'draft'
                   CHECK(status IN ('draft', 'confirmed', 'closed')),
  created_by       INTEGER REFERENCES users(id),
  created_at       TEXT    DEFAULT (datetime('now')),
  updated_at       TEXT    DEFAULT (datetime('now'))
);
```

#### Table: `purchase_order_items`

```sql
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  po_id         INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  sr_no         INTEGER NOT NULL,
  part_number   TEXT    DEFAULT '',
  description   TEXT    DEFAULT '',
  quantity      REAL    DEFAULT 1.0,
  unit          TEXT    DEFAULT 'NOS',
  unit_price    REAL    DEFAULT 0.0,
  total_amount  REAL    DEFAULT 0.0
);
CREATE INDEX IF NOT EXISTS idx_po_items_po_id ON purchase_order_items(po_id);
```

#### Table: `po_sequence`

```sql
CREATE TABLE IF NOT EXISTS po_sequence (
  year         INTEGER PRIMARY KEY,
  last_number  INTEGER DEFAULT 0
);
```

---

### 2.2 TypeScript Interfaces

Types are split across modules: `src/lib/types.ts` (invoice, company), `src/lib/customer.ts` (customer), `src/hooks/usePurchaseOrders.ts` (purchase order).

```typescript
// ─── Primitive Enumerations ───────────────────────────────────────────────────

export type InvoiceStatus  = "draft" | "final";
export type POStatus       = "draft" | "confirmed" | "closed";
export type Currency       = "USD" | "EUR" | "GBP" | "AED" | "INR";
export type TransportMode  = "BY SEA" | "BY AIR" | "BY ROAD";
export type UserRole       = "admin" | "operator" | "viewer";

// ─── Company / Exporter ───────────────────────────────────────────────────────

export interface CompanySettings {
  id:             number;   // Always 1 (singleton row)
  name:           string;   // Legal entity name
  address:        string;   // Registered address (multi-line)
  gstin:          string;   // 15-char GST Identification Number
  pan:            string;   // 10-char Permanent Account Number
  iec:            string;   // Importer-Exporter Code (10 chars)
  bank_name:      string;   // Remittance bank name
  bank_account:   string;   // Bank account number
  ifsc:           string;   // 11-char IFSC code
  swift:          string;   // 8 or 11-char SWIFT/BIC code
  bank_ad_code:   string;   // Authorised Dealer bank code
  lut_arn_no:     string;   // Letter of Undertaking ARN reference
  lut_arn_date:   string;   // LUT ARN date (ISO date string)
  place:          string;   // City used in signatory block
  signatory_name: string;   // Name printed on signature block
  created_at:     string;   // ISO datetime
  updated_at:     string;   // ISO datetime
}

// ─── Invoice ──────────────────────────────────────────────────────────────────

export interface Invoice {
  id:                     number;
  invoice_number:         string;         // e.g. "EXP/25/2025-26"
  invoice_date:           string;         // ISO date "YYYY-MM-DD"
  transport_mode:         TransportMode;
  buyer_order_no:         string;         // Customer PO no. (from PO.customer_po_no when loaded from PO)
  purchase_order_id:      number | null;  // FK → purchase_orders.id (optional link)
  duty_drawback:          string;         // Duty drawback claim number
  hs_code:                string;         // Harmonised System code
  other_references:       string;         // Miscellaneous references
  consignee_name:         string;         // Importer company name
  consignee_address:      string;         // Full delivery address
  buyer_if_other:         string;         // Buyer address if different from consignee
  country_of_origin:      string;         // Default: "INDIA"
  country_of_destination: string;
  pre_carriage_by:        string;         // "BY ROAD", "BY RAIL", etc.
  place_of_receipt:       string;         // Inland container depot / factory
  pre_carrier:            string;         // Truck / train carrier name
  vessel:                 string;         // Vessel / flight identifier
  port_of_loading:        string;         // e.g. "CHENNAI SEA PORT"
  port_of_discharge:      string;         // Foreign port
  final_destination:      string;         // End city/country if different from PoD
  terms_of_payment:       string;         // e.g. "TELEGRAPHIC TRANSFER"
  currency:               Currency;
  exchange_rate:          number;         // Foreign currency per 1 INR
  net_weight:             string;         // Free-text, e.g. "120.50 KGS"
  gross_weight:           string;         // Free-text, e.g. "135.00 KGS"
  notes:                  string;         // Free-text footer notes
  status:                 InvoiceStatus;
  created_by:             number | null;  // FK → users.id
  finalized_by:           number | null;  // FK → users.id
  created_at:             string;
  updated_at:             string;
  items?:                 InvoiceItem[];
}

export interface InvoiceItem {
  id:           number;
  invoice_id:   number;
  sr_no:        number;         // 1-based sequential
  marks_nos:    string;         // Marks & Nos on packages
  no_of_pkgs:   string;         // e.g. "12 CTNS"
  dimensions:   string;         // e.g. "60×40×30 CMS"
  part_number:  string;         // SKU / part reference
  description:  string;         // Product description (required)
  quantity:     number;         // Numeric quantity
  unit:         string;         // e.g. "NOS", "KGS", "MTR"
  unit_price:   number;         // Price per unit in invoice currency
  total_amount: number;         // quantity × unit_price (computed)
}

// Form values omit server-generated fields
export type InvoiceFormValues = Omit<
  Invoice,
  "id" | "created_at" | "updated_at" | "items"
> & {
  items: Omit<InvoiceItem, "id" | "invoice_id">[];
};

// ─── Purchase Order ───────────────────────────────────────────────────────────

export interface PurchaseOrder {
  id:               number;
  po_number:        string;       // e.g. "PO/12/2025-26"
  po_date:          string;       // ISO date "YYYY-MM-DD"
  customer_id:      number | null;
  customer_name:    string;
  customer_address: string;
  customer_po_no:   string;       // Customer's PO number (Buyer's Order on invoice)
  delivery_date:    string;       // PO expiry date
  delivery_address: string;
  payment_terms:    string;
  currency:         string;
  exchange_rate:    number;
  notes:            string;
  status:           POStatus;
  created_by:       number | null;
  created_at:       string;
  items?:           POItem[];
}

export interface POItem {
  id?:          number;
  po_id?:       number;
  sr_no:        number;
  part_number:  string;
  description:  string;
  quantity:     number;
  unit:         string;
  unit_price:   number;
  total_amount: number;
}

export type POFormValues = Omit<
  PurchaseOrder,
  "id" | "created_at" | "items"
> & { items: POItem[] };

/** List row for invoice PO picker (customer-scoped). */
export interface PurchaseOrderSummary {
  id:             number;
  po_number:      string;
  customer_po_no: string;
  po_date:        string;
  status:         POStatus;
  currency:       string;
}

// ─── Customer Master ──────────────────────────────────────────────────────────

export interface Customer {
  id:                     number;
  name:                   string;
  address:                string;
  country_of_destination: string;
  port_of_discharge:      string;
  final_destination:      string;
  currency:               string;
  pre_carriage_by:        string;
  place_of_receipt:       string;
  pre_carrier:            string;
  port_of_loading:        string;
  created_at:             string;
}

export type CustomerFormData = Omit<Customer, "id" | "created_at">;

// ─── Users ────────────────────────────────────────────────────────────────────

export interface User {
  id:         number;
  name:       string;
  role:       UserRole;
  is_active:  number;  // SQLite stores boolean as 0/1
  created_at: string;
}

export interface UserWithHash extends User {
  pin_hash: string;
}
```

---

### 2.3 Field-by-Field Validation Reference

All validation is declared in `src/lib/schemas.ts` using Zod.

#### Company Settings Fields

| Field Name | Type | Required | Validation Rules |
|---|---|---|---|
| `name` | string | **Yes** | `min(1)` — "Company name is required" |
| `address` | string | **Yes** | `min(1)` — "Address is required" |
| `gstin` | string | No | No pattern enforced (free text) |
| `pan` | string | No | No pattern enforced (free text) |
| `iec` | string | No | No pattern enforced (free text) |
| `bank_name` | string | No | — |
| `bank_account` | string | No | — |
| `ifsc` | string | No | — |
| `swift` | string | No | — |
| `bank_ad_code` | string | No | — |
| `lut_arn_no` | string | No | — |
| `lut_arn_date` | string | No | — |
| `place` | string | No | — |
| `signatory_name` | string | No | — |

#### Invoice Header Fields

| Field Name | Type | Required | Validation Rules |
|---|---|---|---|
| `invoice_number` | string | **Yes** | `min(1)` — "Invoice number is required" |
| `invoice_date` | string | **Yes** | `min(1)` — "Date is required" |
| `transport_mode` | enum | **Yes** | One of: `"BY SEA"`, `"BY AIR"`, `"BY ROAD"` |
| `buyer_order_no` | string | No | — |
| `duty_drawback` | string | No | — |
| `hs_code` | string | No | — |
| `other_references` | string | No | — |
| `consignee_name` | string | **Yes** | `min(1)` — "Consignee name is required" |
| `consignee_address` | string | **Yes** | `min(1)` — "Consignee address is required" |
| `buyer_if_other` | string | No | — |
| `country_of_origin` | string | No | Default `"INDIA"` |
| `country_of_destination` | string | No | — |
| `pre_carriage_by` | string | No | — |
| `place_of_receipt` | string | No | — |
| `pre_carrier` | string | No | — |
| `vessel` | string | No | — |
| `port_of_loading` | string | No | — |
| `port_of_discharge` | string | No | — |
| `final_destination` | string | No | — |
| `terms_of_payment` | string | No | — |
| `currency` | enum | **Yes** | One of: `"USD"`, `"EUR"`, `"GBP"`, `"AED"`, `"INR"` |
| `exchange_rate` | number | **Yes** | `positive()` — must be > 0 |
| `net_weight` | string | No | Free text |
| `gross_weight` | string | No | Free text |
| `notes` | string | No | — |
| `status` | enum | **Yes** | One of: `"draft"`, `"final"` |
| `purchase_order_id` | number \| null | No | Optional FK when invoice created from a PO |
| `items` | array | **Yes** | `min(1)` — "At least one item is required" |

#### Purchase Order Header Fields

| Field Name | Type | Required | Validation Rules |
|---|---|---|---|
| `po_number` | string | **Yes** | Auto-generated internal ref (`PO/{seq}/{FY}`); read-only in UI |
| `po_date` | string | **Yes** | `min(1)` — "PO date is required" |
| `customer_id` | number | **Yes** | `int().positive()` — must select customer master |
| `customer_name` | string | **Yes** | `min(1)` — denormalized snapshot at save |
| `customer_address` | string | No | — |
| `customer_po_no` | string | **Yes** | `min(1)` — "Customer PO number is required" (printed as Buyer's Order on invoice) |
| `delivery_date` | string | No | PO expiry in UI |
| `currency` | enum | **Yes** | `INR`, `USD`, `EUR`, `GBP`, `AED` |
| `exchange_rate` | number | **Yes** | `positive()` |
| `status` | enum | **Yes** | `draft`, `confirmed`, `closed` |
| `items` | array | **Yes** | `min(1)` line items via `poItemSchema` |

#### Invoice Line Item Fields

| Field Name | Type | Required | Validation Rules |
|---|---|---|---|
| `sr_no` | number | **Yes** | `int().positive()` |
| `marks_nos` | string | No | — |
| `no_of_pkgs` | string | No | — |
| `dimensions` | string | No | — |
| `part_number` | string | No | — |
| `description` | string | **Yes** | `min(1)` — "Description is required" |
| `quantity` | number | **Yes** | `positive()` — "Quantity must be positive" |
| `unit` | string | **Yes** | `min(1)` — "Unit is required" |
| `unit_price` | number | **Yes** | `nonnegative()` — "Price cannot be negative" |
| `total_amount` | number | **Yes** | `nonnegative()` — auto-computed, not user-entered |

#### Zod Schema Definitions

```typescript
// src/lib/schemas.ts

import { z } from "zod";

export const companySettingsSchema = z.object({
  name:           z.string().min(1, "Company name is required"),
  address:        z.string().min(1, "Address is required"),
  gstin:          z.string(),
  pan:            z.string(),
  iec:            z.string(),
  bank_name:      z.string(),
  bank_account:   z.string(),
  ifsc:           z.string(),
  swift:          z.string(),
  bank_ad_code:   z.string(),
  lut_arn_no:     z.string(),
  lut_arn_date:   z.string(),
  place:          z.string(),
  signatory_name: z.string(),
});

export const invoiceItemSchema = z.object({
  sr_no:        z.number().int().positive(),
  marks_nos:    z.string(),
  no_of_pkgs:   z.string(),
  dimensions:   z.string(),
  part_number:  z.string(),
  description:  z.string().min(1, "Description is required"),
  quantity:     z.number().positive("Quantity must be positive"),
  unit:         z.string().min(1, "Unit is required"),
  unit_price:   z.number().nonnegative("Price cannot be negative"),
  total_amount: z.number().nonnegative(),
});

export const invoiceFormSchema = z.object({
  invoice_number:         z.string().min(1, "Invoice number is required"),
  invoice_date:           z.string().min(1, "Date is required"),
  transport_mode:         z.enum(["BY SEA", "BY AIR", "BY ROAD"]),
  buyer_order_no:         z.string(),
  duty_drawback:          z.string(),
  hs_code:                z.string(),
  other_references:       z.string(),
  consignee_name:         z.string().min(1, "Consignee name is required"),
  consignee_address:      z.string().min(1, "Consignee address is required"),
  buyer_if_other:         z.string(),
  country_of_origin:      z.string(),
  country_of_destination: z.string(),
  pre_carriage_by:        z.string(),
  place_of_receipt:       z.string(),
  pre_carrier:            z.string(),
  vessel:                 z.string(),
  port_of_loading:        z.string(),
  port_of_discharge:      z.string(),
  final_destination:      z.string(),
  terms_of_payment:       z.string(),
  currency:               z.enum(["USD", "EUR", "GBP", "AED", "INR"]),
  exchange_rate:          z.number().positive(),
  net_weight:             z.string(),
  gross_weight:           z.string(),
  notes:                  z.string(),
  status:                 z.enum(["draft", "final"]),
  purchase_order_id:      z.number().int().nullable().optional(),
  items: z.array(invoiceItemSchema).min(1, "At least one item is required"),
});

export const poItemSchema = z.object({
  sr_no:        z.number().int().positive(),
  part_number:  z.string(),
  description:  z.string().min(1, "Description is required"),
  quantity:     z.number().positive("Quantity must be positive"),
  unit:         z.string().min(1, "Unit is required"),
  unit_price:   z.number().nonnegative("Unit price cannot be negative"),
  total_amount: z.number().nonnegative(),
});

export const poFormSchema = z.object({
  po_number:        z.string().min(1),
  po_date:          z.string().min(1, "PO date is required"),
  customer_id:      z.number().int().positive("Select a customer from the master list"),
  customer_name:    z.string().min(1, "Customer name is required"),
  customer_address: z.string(),
  customer_po_no:   z.string().min(1, "Customer PO number is required"),
  delivery_date:    z.string(),
  delivery_address: z.string(),
  payment_terms:    z.string(),
  currency:         z.enum(["INR", "USD", "EUR", "GBP", "AED"]),
  exchange_rate:    z.number().positive(),
  notes:            z.string(),
  status:           z.enum(["draft", "confirmed", "closed"]),
  created_by:       z.number().nullable(),
  items:            z.array(poItemSchema).min(1, "At least one line item is required"),
});

export type CompanySettingsFormValues = z.infer<typeof companySettingsSchema>;
export type InvoiceFormSchema         = z.infer<typeof invoiceFormSchema>;
export type POFormSchema              = z.infer<typeof poFormSchema>;
```

---

## SECTION 3: BUSINESS & CALCULATION LOGIC

### 3.1 Line Item Calculation

Each line item's `total_amount` is **always computed** — it is never manually entered.

```
Algorithm: Line Item Total
─────────────────────────
Input:  quantity    (number, > 0)
        unit_price  (number, ≥ 0)

Output: total_amount = quantity × unit_price

Precision: JavaScript floating-point (IEEE 754 double)
Rounding:  No explicit rounding; display uses toFixed(2)
Trigger:   On every change to quantity or unit_price fields
           via React Hook Form watch() + useEffect in LineItemsTable
```

Implementation in `LineItemsTable/index.tsx`:

```typescript
// Pseudo-code representation
const total_amount = Number((quantity * unit_price).toFixed(2));
form.setValue(`items.${index}.total_amount`, total_amount);
```

### 3.2 Invoice Grand Total

The invoice grand total is the **sum of all line item `total_amount` values**.

```
Algorithm: Invoice Grand Total
──────────────────────────────
Input:  items[]  (array of InvoiceItem)

total_quantity = Σ items[i].quantity        for all i
total_amount   = Σ items[i].total_amount    for all i

Notes:
  - There is no separate freight/insurance/packaging field in the schema.
    These charges are either embedded in unit_price or captured in notes.
  - No discount or deduction fields exist at the invoice header level.
  - The total is always expressed in the invoice's selected currency.
```

### 3.3 GST / Tax Logic — Export Under LUT

This application is designed **exclusively for zero-rated exports**. The tax handling is:

| Export Type | GST Treatment | Implementation |
|---|---|---|
| Export under LUT (Letter of Undertaking) | Zero-rated; no IGST charged | `lut_arn_no` and `lut_arn_date` stored and printed on invoice |
| Export with payment of IGST | Not implemented | No IGST rate field exists in schema |

**LUT Reference fields:**
- `company_settings.lut_arn_no` — ARN number of the LUT
- `company_settings.lut_arn_date` — Date LUT was filed

The PDF declaration block prints: _"Export under LUT ARN: {lut_arn_no} dated {lut_arn_date}"_

No IGST percentage, IGST amount, or GST computation exists anywhere in the codebase. All invoice totals represent the taxable value / FOB value only.

### 3.4 Currency & Exchange Rate

The invoice stores both the foreign currency amount and an exchange rate for INR conversion.

```
Algorithm: Currency Representation
────────────────────────────────────
invoice.currency      = selected foreign currency code (USD, EUR, GBP, AED, INR)
invoice.exchange_rate = INR value per 1 unit of foreign currency
                        (e.g., if 1 USD = 84 INR, exchange_rate = 84)

All unit_price and total_amount values are stored in the invoice currency.

INR equivalent (for internal reference only):
  inr_equivalent = total_amount × exchange_rate

Note: exchange_rate defaults to 1.0 for INR invoices.
      The exchange_rate field is editable by the user at invoice creation time.
      No live exchange rate API is integrated.
```

### 3.5 Invoice Number Generation

```
Algorithm: Invoice Number
──────────────────────────
Input:  date  (Date object, defaults to today)

Step 1 — Determine fiscal year:
  month   = date.getMonth() + 1   // 1–12
  fyStart = (month >= 4) ? date.getFullYear() : date.getFullYear() - 1
  fyEnd   = String(fyStart + 1).slice(-2)   // last 2 digits
  fyLabel = `${fyStart}-${fyEnd}`           // e.g. "2025-26"

Step 2 — Get / increment sequence:
  SELECT last_number FROM invoice_sequence WHERE year = fyStart
  IF no row:
    INSERT INTO invoice_sequence (year, last_number) VALUES (fyStart, 1)
    seq = 1
  ELSE:
    UPDATE invoice_sequence SET last_number = last_number + 1 WHERE year = fyStart
    seq = last_number + 1

Step 3 — Format:
  invoice_number = `EXP/${seq}/${fyLabel}`
  // Examples: EXP/1/2025-26, EXP/25/2025-26, EXP/100/2025-26

Notes:
  - Sequence resets to 1 at the start of each fiscal year (April 1).
  - April is month 4 → FY start = current year.
  - March is month 3 → FY start = previous year.
```

### 3.6 Purchase Order Number Generation

Identical algorithm to invoice numbering, using `po_sequence` table and prefix `PO`:

```
po_number = `PO/${seq}/${fyLabel}`
// Examples: PO/1/2025-26, PO/7/2025-26
```

**Do not confuse with `customer_po_no`:** the internal `po_number` is for app tracking and may appear in `other_references` as `Internal PO ref: {po_number}` when an invoice is loaded from a PO. The customer's document number lives in `customer_po_no` and maps to `invoices.buyer_order_no`.

### 3.6a PO → Invoice Field Mapping

Implemented in `src/lib/invoiceFromPo.ts` → `mapPurchaseOrderToInvoiceFields(po, customer?)`:

| Source | Invoice field |
|---|---|
| `po.customer_po_no` | `buyer_order_no` |
| `po.id` | `purchase_order_id` |
| `po.customer_name` / `customer_address` | `consignee_name` / `consignee_address` |
| `po.payment_terms`, `currency`, `exchange_rate`, `notes` | same names |
| `po.po_number` | `other_references` → `Internal PO ref: {po_number}` |
| `po.items[]` | `items[]` (marks/pkgs/dims blank; totals recomputed) |
| `customer.*` shipping defaults | `country_of_destination`, ports, pre-carriage, etc. |

Currency coercion: unknown PO currency defaults to `"USD"`; `exchange_rate` is forced to `1` when invoice currency is `INR`.

### 3.6b PO Form Normalization

`normalizePOFormValues(data)` in `usePurchaseOrders.ts` runs before every PO INSERT/UPDATE:

- Trims `customer_po_no`, names, addresses, `payment_terms`, `notes`, line `part_number` / `description` / `unit`
- Renumbers `sr_no` sequentially
- Recomputes each line `total_amount = quantity × unit_price` (does not alter qty/price semantics)

### 3.7 Amount in Words

Used in PDF, HTML preview, and Excel. Implemented in `src/lib/invoiceDocument.ts` → `amountInWords()`.

```
Algorithm: amountInWords(amount: number, currency: string): string
──────────────────────────────────────────────────────────────────
Input:  amount    (number)  — total invoice amount in invoice currency
        currency  (string)  — one of USD, EUR, GBP, AED, INR

Step 1 — Split into major and minor units:
  major = Math.floor(amount)
  minor = Math.round((amount - major) * 100)

Step 2 — Convert major and minor to words (English):
  Uses ones[], teens[], tens[] word arrays
  Handles: 0–999,999,999 range (ones, hundreds, thousands, lakhs, crores)
  numberToWords(n) produces "FIVE THOUSAND THREE HUNDRED TWENTY"

Step 3 — Append currency unit labels:
  Currency unit map:
    USD → major: "US DOLLAR",      minor: "CENTS"
    EUR → major: "EURO",           minor: "CENTS"
    GBP → major: "POUND STERLING", minor: "PENCE"
    AED → major: "UAE DIRHAM",     minor: "FILS"
    INR → major: "INDIAN RUPEE",   minor: "PAISE"

Step 4 — Compose output:
  IF minor === 0:
    return `${words(major)} ${majorUnit} ONLY`
  ELSE:
    return `${words(major)} ${majorUnit} AND ${words(minor)} ${minorUnit} ONLY`

Example:
  amountInWords(5050.25, "USD")
  → "FIVE THOUSAND AND FIFTY US DOLLAR AND TWENTY-FIVE CENTS ONLY"
```

### 3.7a Invoice Display Dates

`formatInvoiceDisplayDate(iso)` in `invoiceDocument.ts` converts stored `YYYY-MM-DD` to `DD.MM.YYYY` for all printed/exported invoices.

### 3.8 PIN Authentication

```
Algorithm: PIN Hashing & Verification
───────────────────────────────────────
Storage:  SHA-256 hash of raw PIN string stored in users.pin_hash

hashPin(pin: string): Promise<string>
  bytes = new TextEncoder().encode(pin)
  buffer = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(buffer))
         .map(b => b.toString(16).padStart(2, "0"))
         .join("")   // lowercase hex string

verifyPin(userId: number, pin: string): Promise<User | null>
  candidate_hash = await hashPin(pin)
  row = SELECT * FROM users WHERE id = userId AND pin_hash = candidate_hash AND is_active = 1
  return row ?? null

PIN Rules (UI validation):
  - Minimum 4 digits
  - Maximum 6 digits
  - Digits only (pattern: /^\d{4,6}$/)
```

---

## SECTION 4: STATE MANAGEMENT & UI WORKFLOW

### 4.1 Authentication Flow

```
App Launch
    │
    ▼
AuthProvider mounts
    │
    ├─ Check sessionStorage["auth_user"]
    │     └─ Found → setCurrentUser(parsed user) → go to Dashboard
    │
    └─ Not found → check userCount()
          ├─ 0 users → navigate to /setup-admin
          └─ ≥ 1 users → navigate to /login

/setup-admin
    User enters: name, PIN, confirm PIN
    → createUser(name, pin, "admin")
    → navigate to /login

/login
    1. Combobox: select user from active users list
    2. PIN pad: enter 4–6 digit PIN
    3. verifyPin(userId, pin)
       ├─ Match → login(user) → sessionStorage.setItem("auth_user", JSON.stringify(user))
       │                      → navigate to /dashboard
       └─ No match → shake animation + "Incorrect PIN" toast

logout()
    → sessionStorage.removeItem("auth_user")
    → navigate to /login
```

### 4.2 Permission System

```typescript
// src/lib/auth.ts

export const PERMISSIONS = {
  view_invoices:    ["admin", "operator", "viewer"],
  export_invoice:   ["admin", "operator", "viewer"],
  create_invoice:   ["admin", "operator"],
  edit_invoice:     ["admin", "operator"],
  finalize_invoice: ["admin"],
  delete_invoice:   ["admin"],
  access_settings:  ["admin"],
  manage_users:     ["admin"],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly string[]).includes(role);
}
```

`PermissionGuard` component wraps protected routes:

```tsx
// Renders children only if currentUser has the required permission
// Otherwise redirects to /dashboard
<PermissionGuard permission="finalize_invoice">
  <FinalizeButton />
</PermissionGuard>
```

`AuthContext.can(permission)` is the hook-based equivalent:

```tsx
const { can } = useAuth();
if (can("delete_invoice")) { /* show delete button */ }
```

### 4.3 Invoice Creation Workflow

```
Route: /invoices/new and /invoices/:id/edit  (InvoiceNew.tsx)
────────────────────────────────────────────────────────────
Single-page form (NOT a multi-step wizard)

State:
  - React Hook Form + invoiceFormSchema
  - LineItemsTable (qty editable; totals recalc on invoice only)
  - Customer combobox + PO select filtered by customer_id
  - purchase_order_id saved on invoice row (never updates PO tables)

Step 0 — Customer & Purchase Order
  ┌─────────────────────────────────────────────────────┐
  │ Customer → getPurchaseOrdersByCustomerId()        │
  │ PO select → mapPurchaseOrderToInvoiceFields()       │
  │ buyer_order_no ← customer_po_no (PDF/Excel preview) │
  │ Edit: invoice loaded once; pickers sync after       │
  │       customers load; PO restored via purchase_     │
  │       order_id                                      │
  └─────────────────────────────────────────────────────┘

Step 1 — Invoice Header
  ┌─────────────────────────────────────────────────────┐
  │ Invoice Number / Date / Transport Mode              │
  │ Buyer's Order No / Duty Drawback / HS Code          │
  │ Other References (may include internal PO ref)      │
  └─────────────────────────────────────────────────────┘

Step 2 — Consignee (editable after PO load)
  ┌─────────────────────────────────────────────────────┐
  │ Consignee Name / Address / Buyer if Other           │
  └─────────────────────────────────────────────────────┘

Step 3 — Shipping Details
  ┌─────────────────────────────────────────────────────┐
  │ Country of Origin / Country of Destination         │
  │ Pre-carriage By / Place of Receipt / Pre-carrier    │
  │ Vessel / Port of Loading / Port of Discharge        │
  │ Final Destination                                   │
  └─────────────────────────────────────────────────────┘

Step 4 — Financial Details
  ┌─────────────────────────────────────────────────────┐
  │ Terms of Payment                                    │
  │ Currency (select)                                   │
  │ Exchange Rate                                       │
  └─────────────────────────────────────────────────────┘

Step 5 — Line Items (LineItemsTable component)
  ┌─────────────────────────────────────────────────────┐
  │ Dynamic table; Add/Remove rows                      │
  │ Each row: Sr No │ Marks │ Pkgs │ Dims │ Part No    │
  │           Description │ Qty │ Unit │ Price │ Total  │
  │ Total auto-computed on qty/price change             │
  │ Grand Total shown below table                       │
  └─────────────────────────────────────────────────────┘

Step 6 — Additional Info
  ┌─────────────────────────────────────────────────────┐
  │ Net Weight / Gross Weight                           │
  │ Notes (textarea)                                    │
  └─────────────────────────────────────────────────────┘

Submission Buttons:
  [Save Draft]    → status = "draft"  → createInvoice() → navigate to /invoices/:id
  [Save & Final]  → requires can("finalize_invoice")
                  → status = "final"  → createInvoice() → navigate to /invoices/:id

Validation trigger: on form submit (handleSubmit)
Error display: below each field, text-xs text-destructive
```

### 4.4 Invoice Detail & Actions Workflow

```
Route: /invoices/:id  (InvoiceDetail.tsx)
─────────────────────────────────────────────────────
Loads: invoice + items from DB

Actions available (by role):
  ┌──────────────────────────┬───────────────────────┐
  │ Action                   │ Required Permission   │
  ├──────────────────────────┼───────────────────────┤
  │ Export PDF               │ export_invoice        │
  │ Export Excel             │ export_invoice        │
  │ Edit (→ /invoices/:id/edit) │ edit_invoice      │
  │ Finalize                 │ finalize_invoice      │
  │ Delete                   │ delete_invoice        │
  └──────────────────────────┴───────────────────────┘

Finalize flow:
  → confirm dialog
  → finalizeInvoice(id, currentUser.id)
  → status becomes "final"
  → Edit and Delete buttons hidden for non-admin on finalized invoices
```

### 4.5 Purchase Order Workflow

```
/purchase-orders/new  (PurchaseOrderNew.tsx)
─────────────────────────────────────────────────────
  - Customer combobox → sets customer_id + name/address; loads currency default
  - Customer PO Details: customer_po_no, po_date, expiry (delivery_date),
    payment_terms, currency; internal po_number auto-generated (read-only)
  - Line items: part_number, description, qty, unit, unit_price
  - Validated with poFormSchema; saved via createPurchaseOrder()

/purchase-orders/:id  (PurchaseOrderDetail.tsx)
  [Confirm PO]  → status = "confirmed"
  [Close PO]    → status = "closed"
  [Edit]        → draft only
  [Delete]      → admin
  (No PO PDF/Excel export in current codebase)
```

### 4.6 End-to-End Scenario (Customer → PO → Invoice)

```
1. Customer Management (/customers)
   createCustomer() → customers row

2. Purchase Orders (/purchase-orders/new) — repeat per customer PO received
   Select customer master → customer_id + denormalized name/address
   Enter customer_po_no, dates, terms, currency, line items
   createPurchaseOrder() → purchase_orders + purchase_order_items

3. Export Invoice (/invoices/new)
   Select same customer → getPurchaseOrdersByCustomerId(customer_id)
   Select PO → mapPurchaseOrderToInvoiceFields(); save
   createInvoice() stores invoice + invoice_items + purchase_order_id
   Editing invoice qty updates invoice_items only (PO quantities unchanged)

4. Outputs
   buyer_order_no on invoice = customer PO number
   InvoicePreview + PdfDocument + excel.ts label "Buyer's Order No."
```

### 4.7 Customer Management Workflow

```
/customers  (CustomerManagement.tsx)
─────────────────────────────────────────────────────
Table listing all customers with search filter.

Inline panel (right side) for Add / Edit:
  Fields:
    - Name (required)
    - Address (textarea)
    - Country of Destination
    - Currency
    - Port of Discharge
    - Final Destination
    - Pre-carriage By
    - Place of Receipt
    - Pre-carrier (carrier name)
    - Port of Loading

  [Save]    → createCustomer() or updateCustomer()
  [Cancel]  → close panel
  [Delete]  → deleteCustomer() (with confirmation)
```

### 4.8 Settings Workflow

```
/settings  (Settings.tsx)  — admin only
─────────────────────────────────────────────────────
Loads: company_settings row (id=1)

Tab: Company Info
  Fields: name, address, gstin, pan, iec
  
Tab: Bank Details
  Fields: bank_name, bank_account, ifsc, swift, bank_ad_code

Tab: Export Details
  Fields: lut_arn_no, lut_arn_date, place, signatory_name

[Save Settings]  → saveSettings(data)
  → UPDATE company_settings SET ... WHERE id=1
  → toast.success("Settings saved")
```

### 4.9 Error Handling Patterns

| Scenario | Handling |
|---|---|
| Form validation failure | Zod errors displayed inline below each field; submit blocked |
| DB query failure | `catch(e)` → `toast.error(\`Error: ${e}\`)` |
| PIN mismatch | Shake animation on PIN input + toast error |
| Empty list states | "No invoices found" placeholder text in list views |
| Loading states | Boolean `isLoading` → spinner / "Loading..." text |
| Navigation guard | `PermissionGuard` redirects to /dashboard silently |

---

## SECTION 5: OUTPUT & EXPORT SPECIFICATIONS

### 5.0 Shared Invoice Document Utilities (`invoiceDocument.ts`)

All three output paths (screen preview, PDF, Excel) import from `src/lib/invoiceDocument.ts`:

| Export | Purpose |
|---|---|
| `formatInvoiceDisplayDate(iso)` | `YYYY-MM-DD` → `DD.MM.YYYY` on printed dates |
| `invoiceReferenceRows(invoice, company)` | Ordered right-column refs: Invoice No & date, Buyer's Order No., Duty Drawback, Bank AD Code, HS Code, LUT ARN, Other Reference(s) |
| `fmtAmount(n, decimals?)` | Thousands-separated amounts (`en-US`, 2 dp default) |
| `amountInWords(amount, currency)` | Footer legal text (see §3.7) |

**Rate column label (all formats):** `EX WORK {invoice.currency}` on quantity/rate header row.

**HTML preview:** `src/components/InvoicePreview/index.tsx` — mirrors PDF grid with Tailwind `border-black`.

---

### 5.1 PDF Generation Engine

**Library:** `@react-pdf/renderer`  
**Entry point:** `src/lib/pdf.ts` → `exportInvoicePdf(invoice, company)`  
**Component:** `src/components/InvoicePreview/PdfDocument.tsx` (uses `invoiceReferenceRows`, `formatInvoiceDisplayDate`, `amountInWords`, `fmtAmount`)

#### Export Flow

```
exportInvoicePdf(invoice: Invoice, company: CompanySettings): Promise<void>
──────────────────────────────────────────────────────────────────────────
1. Call dialog.save({ filters: [{ name: "PDF", extensions: ["pdf"] }] })
   → User selects save path
   → If user cancels → return early

2. blob = await pdf(<InvoicePdfDocument invoice={invoice} company={company} />).toBlob()

3. arrayBuffer = await blob.arrayBuffer()
   uint8Array  = new Uint8Array(arrayBuffer)

4. await fs.writeFile(path, uint8Array)

5. toast.success("PDF exported successfully")
```

#### PDF Document Layout (`InvoicePdfDocument`)

**Page setup:** A4 portrait, 24pt page padding, 8pt Helvetica, **1pt solid black** outer border (`s.outer`).

**Structure (top to bottom):**

1. **Title row** — transport mode (narrow left) + centered **INVOICE CUM PACKING LIST**
2. **Exporter | references** — exporter block (name, address, GSTIN, IEC, PAN); right column from `invoiceReferenceRows()` via `RefRow`
3. **Consignee + shipping (50%) | Buyer + countries + terms (50%)** — left: consignee, then `ShipCell` rows (pre-carriage, pre-carrier, vessel/loading, discharge/final destination); right: buyer-if-other, origin/destination split, terms of payment
4. **Line table** — columns ~10% / 12% / 38% / 10% / 15% / 15%; sub-header row `NOS` | `EX WORK {currency}`; lines show marks+dims, pkgs, description+part no, qty, rate, amount
5. **Totals row** — optional net/gross weight left; **TOTAL** qty and amount right
6. **Amount in words** — `(IN WORDS)` + `amountInWords`; right cell **TOTAL {currency}** + formatted sum
7. **Footer** — declaration + optional LUT line (left); place, date (`formatInvoiceDisplayDate`), signatory block (right). Bank block removed from PDF (bank details are company settings only; not rendered in current layout).

#### PDF Style Constants

```typescript
const s = StyleSheet.create({
  page:        { padding: 24, fontSize: 8, fontFamily: "Helvetica" },
  outer:       { border: "1pt solid #000" },
  bold:        { fontFamily: "Helvetica-Bold" },
  borderB:     { borderBottom: "1pt solid #000" },
  borderR:     { borderRight: "1pt solid #000" },
  label:       { fontSize: 7, color: "#333" },
});
```

---

### 5.2 Excel Generation Engine

**Library:** `xlsx` (SheetJS Community Edition)  
**Entry point:** `src/lib/excel.ts` → `exportInvoiceExcel(invoice, company)`  
**Shared helpers:** `invoiceReferenceRows`, `formatInvoiceDisplayDate`, `amountInWords` from `invoiceDocument.ts`

#### Export Flow

```
exportInvoiceExcel(invoice: Invoice, company: CompanySettings): Promise<void>
──────────────────────────────────────────────────────────────────────────────
1. Build 2D array (rows[]) of cell values (see layout below)

2. wb = XLSX.utils.book_new()
   ws = XLSX.utils.aoa_to_sheet(rows)

3. Apply column widths:
   ws["!cols"] = [
     { wch: 20 },  // Marks & Nos
     { wch: 12 },  // No of Pkgs
     { wch: 30 },  // Description
     { wch: 10 },  // Quantity
     { wch: 16 },  // Rate
     { wch: 16 },  // Amount
   ]

4. XLSX.utils.book_append_sheet(wb, ws, "Invoice")
   xlsxData = XLSX.write(wb, { bookType: "xlsx", type: "array" })

5. path = await dialog.save({ filters: [{ name: "Excel", extensions: ["xlsx"] }] })
   IF user cancels → return

6. await fs.writeFile(path, new Uint8Array(xlsxData))
   toast.success("Excel exported successfully")
```

#### Excel Sheet Layout

Built as `aoa_to_sheet` rows aligned with the PDF/HTML grid (not the older simplified 6-column export):

- Row 1: transport mode | blank | **INVOICE CUM PACKING LIST**
- Exporter block paired with `invoiceReferenceRows()` labels/values (GSTIN/IEC/PAN rows as needed)
- Consignee + buyer header; shipping rows with origin/destination and terms in same positions as preview
- Table header + `NOS` / `EX WORK {currency}` sub-row; item rows with marks/dims, pkgs, description+part no
- Optional net/gross weight row; **TOTAL** qty/amount
- `(IN WORDS)` row + **TOTAL {currency}** column
- Declaration + LUT line; place/date/signatory columns (no separate bank block in sheet)

---

### 5.3 Database Migration Sequence

Migrations are defined as Rust string literals in `src-tauri/src/db/schema.rs` and run via `tauri-plugin-sql` at startup:

| # | Migration Name | What it Creates |
|---|---|---|
| 1 | `create_company_settings` | `company_settings` table + initial row |
| 2 | `create_invoices` | `invoices` table |
| 3 | `create_invoice_items` | `invoice_items` table + index |
| 4 | `create_invoice_sequence` | `invoice_sequence` table |
| 5 | `create_users` | `users` table |
| 6 | `add_created_by_to_invoices` | Adds `created_by`, `finalized_by` columns to `invoices` |
| 7 | `create_customers` | `customers` table (with redundant supplier-like columns) |
| 8 | `simplify_customers` | Drops unused columns from `customers` (via recreate) |
| 9 | `create_purchase_order_module` | `suppliers`, `purchase_orders`, `purchase_order_items`, `po_sequence` |
| 10 | `po_replace_supplier_with_customer` | Drops `supplier_id` from POs; adds `customer_id`, `customer_name`, `customer_address` |
| 11 | `add_purchase_order_id_to_invoices` | Adds `invoices.purchase_order_id` FK → `purchase_orders` (used by invoice create/edit PO picker) |
| 12 | `add_customer_po_no_to_purchase_orders` | Adds `purchase_orders.customer_po_no` (customer document PO number → invoice `buyer_order_no`) |

Database file path: `sqlite:export_invoice.db` (stored in Tauri app data directory)

---

### 5.4 Tauri Configuration

**`src-tauri/tauri.conf.json`:**

```json
{
  "productName": "Export Invoice",
  "version": "0.1.0",
  "identifier": "com.exportinvoice.app",
  "build": {
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [{
      "title": "Export Invoice",
      "width": 1280,
      "height": 800,
      "resizable": true
    }],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": ["msi", "nsis"]
  }
}
```

**`src-tauri/Cargo.toml` dependencies (key):**

```toml
[dependencies]
tauri              = { version = "2", features = [] }
tauri-plugin-sql   = { version = "2.4.0", features = ["sqlite"] }
tauri-plugin-fs    = "2.5.1"
tauri-plugin-dialog = "2.7.1"
tauri-plugin-opener = "2"
serde              = { version = "1", features = ["derive"] }
serde_json         = "1"
```

**`vite.config.ts`:**

```typescript
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  optimizeDeps: { include: ["@react-pdf/renderer", "xlsx"] },
  build: { target: "esnext" },
  server: { port: 1420, strictPort: true },
});
```

---

## Appendix: Known Limitations

| Limitation | Impact |
|---|---|
| No IGST computation | Application is LUT-only; IGST-paid exports require manual workaround |
| No live exchange rate | Exchange rate must be entered manually per invoice |
| No freight/insurance line | Must be embedded in unit prices or captured in notes |
| No digital signature on PDF | PDF is unsigned; requires physical wet signature |
| No audit log | Only `created_by` / `finalized_by` tracked; no field-level change history |
| No cloud sync | Single-device SQLite; no backup or multi-user concurrent access |
| No batch export | Invoices must be exported one at a time |
| No advanced list filtering | Text search only; no date range or status filter in list views |
| PIN auth only | No 2FA, no password complexity enforcement beyond 4–6 digit length |
| Last-write-wins | No optimistic locking for concurrent edits (single-user by design) |
