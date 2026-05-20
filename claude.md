# Export Invoice — Definitive System Blueprint

> **Purpose:** Single-source-of-truth reference for rebuilding, validating, or extending this application. Every field, type, rule, and algorithm is documented explicitly — no placeholders.

---

## AGENT GUIDELINES — CURRENT IMPLEMENTATION (2026)

Use this block when extending invoice/PO flows or export layouts.

### 1. What is built

- **Dual PO numbering:** Internal `po_number` (`PO/{seq}/{FY}`) is app-generated; `customer_po_no` is the number on the customer's document and becomes invoice `buyer_order_no` when loading from a PO.
- **Invoice ↔ PO link:** `invoices.purchase_order_id` (migration 11) is set from the invoice form. The create/edit UI picks a customer, then a PO via `getPurchaseOrdersByCustomerId()`, then applies `mapPurchaseOrderToInvoiceFields()`.
- **Delivery address → consignee mapping:** In `mapPurchaseOrderToInvoiceFields`, if `po.delivery_address` is non-empty and differs from `po.customer_address`, the first line of `delivery_address` becomes `consignee_name`, the full `delivery_address` becomes `consignee_address`, and the customer name+address is placed in `buyer_if_other`. Otherwise consignee = customer.
- **SA number per line item:** `sa_number` column on both `purchase_order_items` and `invoice_items` (migration 15). Transferred from PO lines when loading from PO.
- **`show_sa_number` flag:** Per-document boolean on both `purchase_orders` and `invoices` (migration 16). Controls SA Number column visibility in PDF GOODS table. Column widths adjust dynamically when the flag is false.
- **Incoterm per invoice:** `incoterm` column on `invoices` (migration 13). Replaces the old hardcoded "EX WORK" rate column label. `rateColumnLabel(incoterm, currency)` returns `"{incoterm} {currency}"` when set, else just `currency`.
- **Packing list JSON:** `packing_list` stored as TEXT (JSON array) on `invoices` (migration 17). Holds `PackingListItem[]` rows with marks, pkgs, dimensions, and per-row weight. Rendered as a separate PACKING LIST section below GOODS in PDF and Excel. Loaded via `JSON.parse` in `getInvoice()`.
- **Company logo:** `company_logo_base64` on `company_settings` (migration 18). Uploaded in Settings (max 2 MB, stored as data-URL). Rendered in PDF header (left cell). In Excel, 3 reserved rows + `!images` (SheetJS CE silently ignores `!images` — Pro feature).
- **Shared document layer:** `src/lib/invoiceDocument.ts` exports `formatInvoiceDisplayDate`, `invoiceReferenceRows`, `fmtAmount`, `amountInWords`, and `rateColumnLabel` — consumed by HTML preview, PDF, and Excel; do not reimplement them.
- **Build:** Tauri `bundle.targets` is `["msi", "nsis"]` (Windows installers only).
- **Purchase Order improvement – DELIVER TO field:** Now reuses exact Customer selector (auto-fetches record + address like main Customer field). Fixed duplicate name in form + restored full name+address in delivery_address so it appears correctly after save in PO view. Only frontend form updated in PurchaseOrderNew.tsx. Sessions 1-4 completed.
- **Purchase Order improvement – DELIVER TO field:** Now reuses exact Customer selector (auto-fetches record + address like main Customer field). Fixed duplicate customer name in form, PO view, and generated Invoice Consignee section (clean name + address). Sessions 1-6 completed.
- **Invoice logic improvement (May 2026):**
  • Added `port_of_discharge` + `final_destination` to `PurchaseOrder` (Rust + TS + migration 19).
  • Invoice now uses PO delivery fields when present/non-empty; falls back to buyer details otherwise.
  • Inline comments added for future clarity.

### 2. Files affected (by area)

| Area | Paths |
|---|---|
| Schema | `src-tauri/src/db/schema.rs` (migrations 1–19) |
| Types | `src/lib/types.ts`, `src/lib/schemas.ts` |
| Invoice CRUD | `src/hooks/useInvoices.ts` |
| PO CRUD | `src/hooks/usePurchaseOrders.ts` |
| PO → invoice mapping | `src/lib/invoiceFromPo.ts` |
| Company settings | `src/hooks/useSettings.ts` |
| Invoice form UI | `src/routes/InvoiceNew.tsx` |
| Invoice detail | `src/routes/InvoiceDetail.tsx` |
| PO UI | `src/routes/PurchaseOrderNew.tsx`, `PurchaseOrderList.tsx`, `PurchaseOrderDetail.tsx` |
| Settings UI | `src/routes/Settings.tsx` |
| Shared doc utilities | `src/lib/invoiceDocument.ts` |
| PDF export | `src/lib/pdf.ts`, `src/components/InvoicePreview/PdfDocument.tsx` |
| Excel export | `src/lib/excel.ts` |
| HTML preview | `src/components/InvoicePreview/index.tsx` |

### 3. Patterns to follow

- **Invoice outputs:** Import `invoiceReferenceRows`, `formatInvoiceDisplayDate`, `amountInWords`, `fmtAmount`, and `rateColumnLabel` from `@/lib/invoiceDocument`. Never reimplement these per format.
- **Rate column label:** Always call `rateColumnLabel(invoice.incoterm, invoice.currency)` — not a hardcoded string.
- **SA number column:** Read `invoice.show_sa_number` to toggle the SA Number column and adjust widths in all output paths.
- **Packing list:** `invoice.packing_list` is `PackingListItem[]` parsed from JSON. Render as a distinct PACKING LIST section (not mixed with invoice items).
- **Pre-fill from PO:** Call `mapPurchaseOrderToInvoiceFields(po, customer)` — includes delivery_address→consignee logic and `show_sa_number` transfer.
- **PO saves:** Run `normalizePOFormValues(data)` inside `createPurchaseOrder` / `updatePurchaseOrder` (already wired). Validate UI with `poFormSchema.safeParse` before save.
- **Edit invoice pickers:** Load form once (`editFormLoadedRef`); sync customer/PO comboboxes after customers load using `purchase_order_id` + `getPurchaseOrder`.

### 4. Deprecated / avoid

- Hardcoding `"EX WORK {currency}"` — use `rateColumnLabel()`.
- Putting the customer's PO number in `po_number` or deriving `buyer_order_no` from the internal `PO/…` sequence.
- Duplicating `invoiceReferenceRows`, `amountInWords`, or date formatting in PdfDocument, InvoicePreview, or excel.ts.
- Resetting the full invoice form on every customer-list refresh during edit mode.
- Updating source PO line quantities when the user edits qty on a saved invoice.

### 5. Known bugs (do not paper over)

- `updateInvoice` in `useInvoices.ts` omits `sa_number` from the item re-INSERT — items lose their SA number on edit-save.
- `createPurchaseOrder` / `updatePurchaseOrder` do not persist `show_sa_number` — flag always writes as the column default (`TRUE`).
- `generatePONumber` commits the sequence counter as a side effect of previewing the number; `generateInvoiceNumber` is correctly read-only.

---

## SECTION 1: SYSTEM OVERVIEW & ARCHITECTURE

### What the Application Does

**Export Invoice** is a Windows desktop application for Indian exporters to create, manage, and export commercial export invoices and purchase orders. It targets compliance with Indian customs/DGFT requirements: it stores LUT/ARN references, IEC, GSTIN, HS codes, duty drawback references, and generates invoice-cum-packing-list documents suitable for submission to shipping lines and customs authorities.

Core capabilities:
- Create and finalize export invoices with full shipping metadata
- Generate **Invoice-cum-Packing List** PDFs (A4) — two sections: GOODS and PACKING LIST
- Export invoices to Excel (.xlsx) with matching two-section layout
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
| Form management | React Hook Form | 7 |
| Validation | Zod | 4 |
| PDF generation | @react-pdf/renderer | 4 |
| Excel generation | xlsx (SheetJS CE) | 0.18 |
| Database | SQLite via tauri-plugin-sql | 2.4.0 |
| File I/O | tauri-plugin-fs | 2.5.1 |
| File dialogs | tauri-plugin-dialog | 2.7.1 |
| UI primitives | shadcn/ui + Base UI | latest |
| Icons | Lucide React | latest |
| Notifications | Sonner | latest |
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
│   ├── main.tsx
│   ├── App.tsx                   # Router + AuthProvider root
│   ├── index.css
│   ├── components/
│   │   ├── InvoicePreview/
│   │   │   ├── index.tsx         # HTML screen preview
│   │   │   └── PdfDocument.tsx   # @react-pdf/renderer layout
│   │   ├── LineItemsTable/
│   │   │   └── index.tsx         # Dynamic line items with auto-totals
│   │   ├── layout/
│   │   │   └── Layout.tsx
│   │   └── ui/                   # shadcn/ui primitives
│   ├── contexts/
│   │   └── AuthContext.tsx
│   ├── hooks/
│   │   ├── useInvoices.ts        # Invoice CRUD + list hook
│   │   ├── usePurchaseOrders.ts  # PO CRUD + list hook
│   │   └── useSettings.ts        # Company settings + logo hook
│   ├── lib/
│   │   ├── auth.ts               # PIN hashing, permissions, canEditInvoiceByStatus
│   │   ├── customer.ts           # Customer master CRUD + Customer type
│   │   ├── db.ts                 # SQLite singleton connection
│   │   ├── excel.ts              # xlsx export
│   │   ├── invoiceDocument.ts    # Shared: refs, dates, fmtAmount, amountInWords, rateColumnLabel
│   │   ├── invoiceFromPo.ts      # PO → invoice field mapping (incl. delivery_address logic)
│   │   ├── pdf.ts                # PDF export via @react-pdf/renderer
│   │   ├── schemas.ts            # Zod schemas (company, invoice, PO, packing list)
│   │   ├── types.ts              # TypeScript interfaces
│   │   └── utils.ts              # cn() helper
│   └── routes/
│       ├── LoginScreen.tsx
│       ├── SetupAdmin.tsx
│       ├── Dashboard.tsx
│       ├── InvoiceList.tsx
│       ├── InvoiceNew.tsx        # Create + edit invoice (single form)
│       ├── InvoiceDetail.tsx     # View + export + finalize
│       ├── PurchaseOrderList.tsx
│       ├── PurchaseOrderNew.tsx
│       ├── PurchaseOrderDetail.tsx
│       ├── Settings.tsx          # Company info + banking + logo (single page, no tabs)
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
        └── db/
            ├── mod.rs
            └── schema.rs         # 18 SQL migration definitions
```

---

## SECTION 2: DATA STRUCTURES & SCHEMAS

### 2.1 Database Schema (SQLite)

All tables are created via numbered Rust migrations in `src-tauri/src/db/schema.rs`.

#### Table: `company_settings`

Stores a single row (`id = 1`).

```sql
CREATE TABLE IF NOT EXISTS company_settings (
  id                  INTEGER PRIMARY KEY,
  name                TEXT    DEFAULT '',
  address             TEXT    DEFAULT '',
  gstin               TEXT    DEFAULT '',
  pan                 TEXT    DEFAULT '',
  iec                 TEXT    DEFAULT '',
  bank_name           TEXT    DEFAULT '',
  bank_account        TEXT    DEFAULT '',
  ifsc                TEXT    DEFAULT '',
  swift               TEXT    DEFAULT '',
  bank_ad_code        TEXT    DEFAULT '',
  lut_arn_no          TEXT    DEFAULT '',
  lut_arn_date        TEXT    DEFAULT '',
  place               TEXT    DEFAULT '',
  signatory_name      TEXT    DEFAULT '',
  company_logo_base64 TEXT    DEFAULT '',   -- migration 18: base64 data-URL, '' = no logo
  created_at          TEXT    DEFAULT (datetime('now')),
  updated_at          TEXT    DEFAULT (datetime('now'))
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
  status                  TEXT    DEFAULT 'draft' CHECK(status IN ('draft', 'final')),
  purchase_order_id       INTEGER REFERENCES purchase_orders(id),   -- migration 11
  created_by              INTEGER REFERENCES users(id),             -- migration 6
  finalized_by            INTEGER REFERENCES users(id),             -- migration 6
  incoterm                TEXT    DEFAULT '',                        -- migration 13: e.g. EXW, FOB, CIF
  show_sa_number          BOOLEAN DEFAULT TRUE,                     -- migration 16
  packing_list            TEXT    DEFAULT '[]',                     -- migration 17: JSON PackingListItem[]
  created_at              TEXT    DEFAULT (datetime('now')),
  updated_at              TEXT    DEFAULT (datetime('now'))
);
```

#### Table: `invoice_items`

```sql
CREATE TABLE IF NOT EXISTS invoice_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id      INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  sr_no           INTEGER NOT NULL,
  marks_nos       TEXT    DEFAULT '',
  no_of_pkgs      TEXT    DEFAULT '',
  dimensions      TEXT    DEFAULT '',
  dimensions_unit TEXT    DEFAULT '',   -- migration 14: MM, CM, INCH, etc.
  part_number     TEXT    DEFAULT '',
  sa_number       TEXT    DEFAULT '',   -- migration 15: shipping advice reference
  description     TEXT    DEFAULT '',
  quantity        REAL    DEFAULT 1.0,
  unit            TEXT    DEFAULT 'NOS',
  unit_price      REAL    DEFAULT 0.0,
  total_amount    REAL    DEFAULT 0.0
);
```

#### Table: `purchase_orders`

```sql
CREATE TABLE IF NOT EXISTS purchase_orders (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  po_number        TEXT    NOT NULL UNIQUE,   -- internal: PO/{seq}/{FY}
  po_date          TEXT    NOT NULL,
  customer_id      INTEGER REFERENCES customers(id),
  customer_name    TEXT    DEFAULT '',        -- denormalized snapshot at save
  customer_address TEXT    DEFAULT '',
  customer_po_no   TEXT    DEFAULT '',        -- migration 12: → invoice buyer_order_no
  delivery_date    TEXT    DEFAULT '',
  delivery_address TEXT    DEFAULT '',        -- if set+different → consignee fields on invoice load
  payment_terms    TEXT    DEFAULT '',
  currency         TEXT    DEFAULT 'INR',
  exchange_rate    REAL    DEFAULT 1.0,
  notes            TEXT    DEFAULT '',
  status           TEXT    DEFAULT 'draft' CHECK(status IN ('draft', 'confirmed', 'closed')),
  show_sa_number   BOOLEAN DEFAULT TRUE,      -- migration 16: transferred to invoice on PO load
  created_by       INTEGER REFERENCES users(id),
  created_at       TEXT    DEFAULT (datetime('now')),
  updated_at       TEXT    DEFAULT (datetime('now'))
);
```

#### Table: `purchase_order_items`

```sql
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  po_id        INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  sr_no        INTEGER NOT NULL,
  part_number  TEXT    DEFAULT '',
  sa_number    TEXT    DEFAULT '',   -- migration 15
  description  TEXT    DEFAULT '',
  quantity     REAL    DEFAULT 1.0,
  unit         TEXT    DEFAULT 'NOS',
  unit_price   REAL    DEFAULT 0.0,
  total_amount REAL    DEFAULT 0.0
);
```

Other tables unchanged from initial migrations: `invoice_sequence`, `po_sequence`, `users`, `customers`.

---

### 2.2 TypeScript Interfaces (`src/lib/types.ts`)

```typescript
export type InvoiceStatus  = "draft" | "final";
export type Currency       = "USD" | "EUR" | "GBP" | "AED" | "INR";
export type TransportMode  = "BY SEA" | "BY AIR" | "BY ROAD" | "BY COURIER";
export type UserRole       = "admin" | "operator" | "viewer";

export interface CompanySettings {
  id:                  number;
  name:                string;
  address:             string;
  gstin:               string;
  pan:                 string;
  iec:                 string;
  bank_name:           string;
  bank_account:        string;
  ifsc:                string;
  swift:               string;
  bank_ad_code:        string;
  lut_arn_no:          string;
  lut_arn_date:        string;
  place:               string;
  signatory_name:      string;
  company_logo_base64: string;   // base64 data-URL; '' = no logo
  created_at:          string;
  updated_at:          string;
}

export interface Invoice {
  id:                     number;
  invoice_number:         string;
  invoice_date:           string;         // ISO "YYYY-MM-DD"
  transport_mode:         TransportMode;
  buyer_order_no:         string;         // = customer_po_no when loaded from PO
  duty_drawback:          string;
  hs_code:                string;
  other_references:       string;
  consignee_name:         string;
  consignee_address:      string;
  buyer_if_other:         string;
  country_of_origin:      string;
  country_of_destination: string;
  pre_carriage_by:        string;
  place_of_receipt:       string;
  pre_carrier:            string;
  vessel:                 string;
  port_of_loading:        string;
  port_of_discharge:      string;
  final_destination:      string;
  terms_of_payment:       string;
  incoterm:               string;         // e.g. "EXW", "FOB", "CIF"
  currency:               Currency;
  exchange_rate:          number;
  net_weight:             string;
  gross_weight:           string;
  notes:                  string;
  status:                 InvoiceStatus;
  show_sa_number:         boolean;        // controls SA Number column in all outputs
  company_logo_base64?:   string;         // injected at detail view from company settings
  purchase_order_id?:     number | null;
  packing_list?:          PackingListItem[];   // parsed from JSON on load
  created_at:             string;
  updated_at:             string;
  items?:                 InvoiceItem[];
}

export interface InvoiceItem {
  id:              number;
  invoice_id:      number;
  sr_no:           number;
  marks_nos:       string;
  no_of_pkgs:      string;
  dimensions:      string;
  dimensions_unit: string;   // MM, CM, INCH, etc.
  part_number:     string;
  sa_number:       string;   // shipping advice reference
  description:     string;
  quantity:        number;
  unit:            string;
  unit_price:      number;
  total_amount:    number;   // computed: quantity × unit_price
}

export interface PackingListItem {
  sr_no:           number;
  marks_nos:       string;
  no_of_pkgs:      string;
  dimensions:      string;
  dimensions_unit: string;
  net_weight?:     string;
  gross_weight?:   string;
}

export type InvoiceFormValues = Omit<Invoice, "id" | "created_at" | "updated_at" | "items"> & {
  items: Omit<InvoiceItem, "id" | "invoice_id">[];
  packing_list?: PackingListItem[];
};
```

PO interfaces live in `src/hooks/usePurchaseOrders.ts`:

```typescript
export interface POItem {
  id?:          number;
  po_id?:       number;
  sr_no:        number;
  part_number:  string;
  sa_number:    string;
  description:  string;
  quantity:     number;
  unit:         string;
  unit_price:   number;
  total_amount: number;
}

export interface PurchaseOrder {
  id:               number;
  po_number:        string;       // internal: PO/{seq}/{FY}
  po_date:          string;
  customer_id:      number | null;
  customer_name:    string;
  customer_address: string;
  customer_po_no:   string;       // printed as Buyer's Order on invoice
  delivery_date:    string;
  delivery_address: string;       // if set + differs from customer_address → consignee fields
  payment_terms:    string;
  currency:         string;
  exchange_rate:    number;
  notes:            string;
  status:           "draft" | "confirmed" | "closed";
  show_sa_number:   boolean;
  created_by:       number | null;
  created_at:       string;
  items?:           POItem[];
}

export interface PurchaseOrderSummary {
  id:             number;
  po_number:      string;
  customer_po_no: string;
  po_date:        string;
  status:         PurchaseOrder["status"];
  currency:       string;
}
```

---

### 2.3 Zod Schemas (`src/lib/schemas.ts`)

```typescript
export const packingListItemSchema = z.object({
  sr_no:           z.number().int().positive(),
  marks_nos:       z.string(),
  no_of_pkgs:      z.string(),
  dimensions:      z.string(),
  dimensions_unit: z.string(),
  net_weight:      z.string().optional(),
  gross_weight:    z.string().optional(),
});

export const invoiceItemSchema = z.object({
  sr_no:           z.number().int().positive(),
  marks_nos:       z.string(),
  no_of_pkgs:      z.string(),
  dimensions:      z.string(),
  dimensions_unit: z.string(),
  part_number:     z.string(),
  sa_number:       z.string(),
  description:     z.string().min(1, "Description is required"),
  quantity:        z.number().positive("Quantity must be positive"),
  unit:            z.string().min(1, "Unit is required"),
  unit_price:      z.number().nonnegative("Price cannot be negative"),
  total_amount:    z.number().nonnegative(),
  included:        z.boolean().optional(),
});

export const invoiceFormSchema = z.object({
  invoice_number:         z.string().min(1, "Invoice number is required"),
  invoice_date:           z.string().min(1, "Date is required"),
  transport_mode:         z.enum(["BY SEA", "BY AIR", "BY ROAD", "BY COURIER"]),
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
  incoterm:               z.string(),
  currency:               z.enum(["USD", "EUR", "GBP", "AED", "INR"]),
  exchange_rate:          z.number().positive(),
  net_weight:             z.string(),
  gross_weight:           z.string(),
  notes:                  z.string(),
  status:                 z.enum(["draft", "final"]),
  show_sa_number:         z.boolean().default(true),
  purchase_order_id:      z.number().int().nullable().optional(),
  items:                  z.array(invoiceItemSchema).min(1, "At least one item is required"),
  packing_list:           z.array(packingListItemSchema).default([]),
});

export const poItemSchema = z.object({
  sr_no:        z.number().int().positive(),
  part_number:  z.string(),
  sa_number:    z.string(),
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
  show_sa_number:   z.boolean().default(true),
  created_by:       z.number().nullable(),
  items:            z.array(poItemSchema).min(1, "At least one line item is required"),
});
```

---

## SECTION 3: BUSINESS & CALCULATION LOGIC

### 3.1 Line Item Calculation

```
total_amount = Number((quantity * unit_price).toFixed(2))
```

Computed on every qty/price change via React Hook Form `watch()` + `useEffect`. Stored in DB; not recomputed on read.

### 3.2 Invoice Grand Total

```
total_qty    = Σ items[i].quantity
total_amount = Σ items[i].total_amount
```

No freight/insurance/discount fields. No IGST (LUT-only exports).

### 3.3 GST / Tax Logic — Export Under LUT

Zero-rated exports only. No IGST computation. `lut_arn_no` and `lut_arn_date` are stored on `company_settings` and printed on all outputs as: `Export under LUT ARN: {lut_arn_no} dated {lut_arn_date}`.

### 3.4 Currency & Exchange Rate

- All `unit_price`/`total_amount` stored in invoice currency.
- `exchange_rate` = INR per 1 unit of foreign currency (e.g., 84 for USD).
- `exchange_rate` forced to 1 when invoice currency is INR (applied in `mapPurchaseOrderToInvoiceFields`).

### 3.5 Invoice Number Generation

```
Format:  EXP/{seq}/{fyLabel}   e.g. EXP/25/2025-26

Fiscal year:  April–March.
  fyStart = (month >= 4) ? year : year - 1
  fyLabel = `${fyStart}-${String(fyStart + 1).slice(-2)}`

Sequence:
  generateInvoiceNumber(date?)  → read-only preview (does NOT commit)
  allocateInvoiceNumber(date)   → commits counter; called only inside createInvoice()
  deleteInvoice()               → recalculates sequence from remaining rows using MAX(seq)
```

### 3.6 Purchase Order Number Generation

```
Format:  PO/{seq}/{fyLabel}   e.g. PO/7/2025-26

⚠ generatePONumber() commits the counter as a side effect (unlike generateInvoiceNumber).
```

### 3.7 PO → Invoice Field Mapping (`src/lib/invoiceFromPo.ts`)

| Source | Invoice field | Notes |
|---|---|---|
| `po.customer_po_no` | `buyer_order_no` | |
| `po.id` | `purchase_order_id` | |
| `po.show_sa_number` | `show_sa_number` | |
| `po.payment_terms` | `terms_of_payment` | |
| `po.currency` | `currency` | unknown → coerced to "USD" |
| `po.exchange_rate` | `exchange_rate` | forced to 1 when currency = INR |
| `po.notes` | `notes` | |
| `po.po_number` | `other_references` | formatted as `Internal PO ref: {po_number}` |
| `po.items[]` | `items[]` | marks/pkgs/dims blank; `sa_number` transferred |
| `customer.*` | shipping defaults | country, ports, pre-carriage fields |

**Delivery address → consignee logic:**

```
if delivery_address.trim() !== "" AND delivery_address.trim() !== customer_address.trim():
  consignee_name    = delivery_address.split("\n")[0].trim()
  consignee_address = delivery_address
  buyer_if_other    = customer_name + "\n" + customer_address
else:
  consignee_name    = customer_name
  consignee_address = customer_address
  buyer_if_other    = ""
```

### 3.8 PO Form Normalization (`normalizePOFormValues`)

Before every PO INSERT/UPDATE: trims `customer_po_no`, names, addresses, `payment_terms`, `notes`, line `part_number`/`sa_number`/`description`/`unit`; renumbers `sr_no` sequentially; recomputes `total_amount = quantity × unit_price`.

### 3.9 Amount in Words (`amountInWords` in `invoiceDocument.ts`)

Converts numeric total to English words. Currency unit map:

| Currency | Major | Minor |
|---|---|---|
| USD | US DOLLAR | CENTS |
| EUR | EURO | CENTS |
| GBP | POUND STERLING | PENCE |
| AED | UAE DIRHAM | FILS |
| INR | INDIAN RUPEE | PAISE |

Output format: `{major words} {MAJOR UNIT} [AND {minor words} {MINOR UNIT}] ONLY`

### 3.10 Rate Column Label (`rateColumnLabel` in `invoiceDocument.ts`)

```typescript
rateColumnLabel(incoterm: string, currency: string): string
// incoterm.trim() ? `${incoterm} ${currency}` : currency
// e.g. "EXW USD", "FOB EUR", or just "USD"
```

### 3.11 Display Date Formatting

`formatInvoiceDisplayDate(iso)`: `"YYYY-MM-DD"` → `"DD.MM.YYYY"`. Used on all printed/exported invoices.

### 3.12 PIN Authentication

SHA-256 hex digest stored in `users.pin_hash`. 4–6 digit PIN, digits only.

`canEditInvoiceByStatus(role, status)` in `auth.ts`: controls Edit button visibility based on both role and invoice finalization state (finalized invoices are locked for non-admin).

---

## SECTION 4: STATE MANAGEMENT & UI WORKFLOW

### 4.1 Company Settings Hook (`useSettings`)

Returns: `{ settings, loading, error, saveSettings, saveLogo, reload, companyLogo }`.

- `saveSettings(data)`: Updates all text fields in `company_settings WHERE id=1`.
- `saveLogo(base64)`: Updates `company_logo_base64` separately. Called immediately on file select.
- `companyLogo`: Shorthand for `settings?.company_logo_base64 ?? ""`.

### 4.2 Invoice Data Flow

```
getInvoice(id)
  → SELECT * FROM invoices
  → JSON.parse(invoice.packing_list)     ← packing list deserialized
  → SELECT * FROM invoice_items ORDER BY sr_no
  → returns Invoice with .items[] and .packing_list[]

createInvoice(data, createdBy?)
  → allocateInvoiceNumber()              ← commits sequence
  → INSERT INTO invoices (incoterm, packing_list=JSON.stringify(...), ...)
  → INSERT INTO invoice_items (dimensions_unit, sa_number, ...)

updateInvoice(id, data)
  → UPDATE invoices SET incoterm, packing_list=JSON.stringify(...)
  → DELETE + re-INSERT invoice_items
  ⚠ Bug: sa_number omitted from item re-INSERT (items lose SA number on edit)

deleteInvoice(id)
  → DELETE FROM invoices
  → Recalculates invoice_sequence.last_number from remaining rows
```

### 4.3 Invoice Create/Edit Form (`InvoiceNew.tsx`)

Single-page form (not a wizard). Sections: Customer & PO selector → Invoice header → Consignee → Shipping details → Financial details → Line items (LineItemsTable) → Packing list → Additional info (weights, notes).

Key behaviors:
- Customer combobox → loads PO list via `getPurchaseOrdersByCustomerId()`
- PO select → calls `mapPurchaseOrderToInvoiceFields()` to pre-fill form
- `editFormLoadedRef` prevents re-loading on customer list refresh during edit
- `purchase_order_id` stored on invoice; never updates PO tables

### 4.4 PDF Document Layout (`PdfDocument.tsx`)

**Page:** A4 portrait, 24pt padding, 8pt Helvetica, 1pt solid black outer border.

**Structure (top → bottom):**

1. **Header row:** Logo cell (85pt, green tint, `company_logo_base64`) | "INVOICE CUM PACKING LIST" (centered) | transport mode cell (70pt)
2. **Exporter | References:** Exporter block (name, address, GSTIN, IEC, PAN); right column: Invoice No & date (indigo highlight box) + `invoiceReferenceRows()` rows
3. **Consignee+shipping | Buyer+countries+terms:** Left 50%: consignee, pre-carriage rows, vessel, discharge; Right 50%: buyer-if-other, origin/destination, terms of payment, incoterm
4. **GOODS section:** Conditional SA Number column; `rateColumnLabel` sub-header; item rows; TOTAL row with highlighted amount cell
5. **Amount in words row**
6. **PACKING LIST section:** Sr | Marks & Nos | No of Pkgs | Dimensions | Unit; footer: Net/Gross weight
7. **Declaration + signature:** LUT line (if set), place, date, signatory block

Column widths in GOODS (with `show_sa_number = true`): Sr 5% | SA# 10% | Part 14% | Desc 38% | Qty 10% | Rate 11% | Amt 12%. Without SA#: Sr 6% | Part 16% | Desc 42% | Qty 10% | Rate 13% | Amt 13%.

### 4.5 Excel Export Layout (`excel.ts`)

Built as `aoa_to_sheet` (rows array) mirroring the PDF grid:

- **Logo:** 3 reserved blank rows at top (`!rows` height set; `!images` wired for SheetJS Pro, silently ignored by CE)
- Transport mode | blank | INVOICE CUM PACKING LIST
- Invoice No + Date header row
- Exporter block interleaved with `invoiceReferenceRows()` label/value pairs
- Consignee + buyer; shipping rows (pre-carriage, vessel, discharge, destination, terms)
- **GOODS:** header + `NOS` / `rateColumnLabel` sub-row; item rows (sr, part, description, qty, rate, amount); TOTAL row
- `(IN WORDS)` row
- **PACKING LIST:** header; item rows (sr, marks, pkgs, dimensions, dimensions_unit); net/gross weight row
- Declaration; LUT line; place/date; signatory

Column widths: `[6, 22, 36, 12, 18, 18]` wch.

### 4.6 Settings Page (`Settings.tsx`)

Single page, no tabs. Four cards:
1. **Exporter Information** — name, address, GSTIN, PAN, IEC
2. **Banking & Export Details** — bank name/account, IFSC, SWIFT, AD code, LUT ARN no/date
3. **Signatory Details** — place, signatory name
4. **Company Logo** — file upload (`image/*`, ≤2 MB); stored as base64 data-URL via `saveLogo()` immediately on selection; shows preview + remove button if set

### 4.7 Permission System

```typescript
export const PERMISSIONS = {
  view_invoices:    ["admin", "operator", "viewer"],
  export_invoice:   ["admin", "operator", "viewer"],
  create_invoice:   ["admin", "operator"],
  edit_invoice:     ["admin", "operator"],
  finalize_invoice: ["admin"],
  delete_invoice:   ["admin"],
  access_settings:  ["admin"],
  manage_users:     ["admin"],
};
```

`canEditInvoiceByStatus(role, status)` additionally locks editing of finalized invoices for non-admin roles.

### 4.8 Error Handling Patterns

| Scenario | Handling |
|---|---|
| Form validation failure | Zod errors inline below each field; submit blocked |
| DB query failure | `catch(e)` → `toast.error(String(e))` |
| PIN mismatch | Shake animation + toast error |
| Logo too large | `toast.error("Image must be under 2 MB")` |
| Empty list states | Placeholder text |
| Loading states | `isLoading` → spinner / "Loading..." text |
| Permission denied | `PermissionGuard` redirects to /dashboard |

---

## SECTION 5: OUTPUT & EXPORT SPECIFICATIONS

### 5.1 Shared Document Utilities (`invoiceDocument.ts`)

| Export | Signature | Purpose |
|---|---|---|
| `formatInvoiceDisplayDate` | `(iso: string) → string` | `YYYY-MM-DD` → `DD.MM.YYYY` |
| `invoiceReferenceRows` | `(invoice, company) → LabelValueRow[]` | Ordered right-column refs |
| `rateColumnLabel` | `(incoterm, currency) → string` | Rate column header |
| `fmtAmount` | `(n, decimals=2) → string` | `en-US` locale, 2dp default |
| `amountInWords` | `(amount, currency) → string` | Legal footer text |

`invoiceReferenceRows` order: Invoice No & date, Buyer's Order No., DUTY DRAWBACK UNDER, BANK AD CODE, HS CODE, LUT ARN NO.

### 5.2 Database Migration Sequence

| # | Description | What it adds |
|---|---|---|
| 1 | `create_company_settings` | `company_settings` table + row 1 |
| 2 | `create_invoices` | `invoices` table |
| 3 | `create_invoice_items` | `invoice_items` + index |
| 4 | `create_invoice_sequence` | `invoice_sequence` |
| 5 | `create_users` | `users` |
| 6 | `add_created_by_to_invoices` | `created_by`, `finalized_by` on invoices |
| 7 | `create_customers` | `customers` |
| 8 | `simplify_customers` | Drops `buyer_if_other`, `terms_of_payment`, `transport_mode` from customers |
| 9 | `create_purchase_order_module` | `suppliers`, `purchase_orders`, `purchase_order_items`, `po_sequence` |
| 10 | `po_replace_supplier_with_customer` | Drops supplier cols; adds `customer_id`, `customer_name`, `customer_address` |
| 11 | `add_purchase_order_id_to_invoices` | `invoices.purchase_order_id` FK |
| 12 | `add_customer_po_no_to_purchase_orders` | `purchase_orders.customer_po_no` |
| 13 | `add_incoterm_to_invoices` | `invoices.incoterm` |
| 14 | `add_dimensions_unit_to_invoice_items` | `invoice_items.dimensions_unit` |
| 15 | `add_sa_number_to_item_tables` | `sa_number` on `purchase_order_items` and `invoice_items` |
| 16 | `add_show_sa_number_to_orders_and_invoices` | `show_sa_number BOOLEAN DEFAULT TRUE` on both |
| 17 | `add_packing_list_to_invoices` | `invoices.packing_list TEXT DEFAULT '[]'` |
| 18 | `add_company_logo_to_settings` | `company_settings.company_logo_base64 TEXT DEFAULT ''` |

### 5.3 Tauri Configuration

```json
{
  "productName": "Export Invoice",
  "version": "0.1.0",
  "identifier": "com.exportinvoice.app",
  "app": {
    "windows": [{ "title": "Export Invoice", "width": 1280, "height": 800, "resizable": true }],
    "security": { "csp": null }
  },
  "bundle": { "active": true, "targets": ["msi", "nsis"] }
}
```

Database: `sqlite:export_invoice.db` in Tauri app data directory.

---

## Appendix: Known Limitations

| Limitation | Impact |
|---|---|
| No IGST computation | LUT-only; IGST-paid exports require manual workaround |
| No live exchange rate | Entered manually per invoice |
| No freight/insurance line | Embedded in unit prices or notes |
| No digital signature on PDF | Physical wet signature required |
| No audit log | Only `created_by` / `finalized_by` tracked |
| No cloud sync | Single-device SQLite |
| No batch export | One invoice at a time |
| No advanced list filtering | Text search only |
| PIN auth only | No 2FA; 4–6 digit length only |
| SheetJS CE image limitation | Logo reserved rows work; `!images` silently ignored (Pro feature) |
| `sa_number` lost on invoice edit | `updateInvoice` omits it from item re-INSERT |
| `show_sa_number` not persisted on PO | `createPurchaseOrder`/`updatePurchaseOrder` do not write the flag |
