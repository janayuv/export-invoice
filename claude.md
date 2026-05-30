# Export Invoice — Agent System Blueprint

> **Purpose:** Single-source-of-truth reference for Claude to rebuild, validate, or extend this application. For DB structures read `src-tauri/src/db/schema.rs`; for entity types `src/lib/types.ts`; for form validation `src/lib/schemas.ts`. Never duplicate those here.

## 1. System Overview & Tech Stack
- **App:** Windows desktop app for Indian exporters managing invoices, POs, and entries (SQLite, offline, role-based, single-company). Includes a 9-page Admin Center under `src/admin/`.
- **Core Stack:** Tauri 2.0 (Rust), React 19, TypeScript 5.8, Vite 7, Tailwind CSS 3.4.
- **UI & Forms:** shadcn/ui, Base UI, React Hook Form, Zod.
- **Exporting:** `@react-pdf/renderer` (PDF), `xlsx` SheetJS CE (Excel); auto-update via `tauri-plugin-updater`.
- **Database:** SQLite via `tauri-plugin-sql`.

## 2. Architecture & Data Access
- **Two data paths (critical):** The frontend **reads** directly via `tauri-plugin-sql` (`db.select(...)` through `src/lib/db.ts`). All **writes** go through Rust `#[tauri::command]` functions backed by a lazy `rusqlite` connection (`AppDb`, `src-tauri/src/db/state.rs`). Never write to the DB from the frontend — call the matching Rust command via `invoke(...)`.
- **AuthSession trusted identity:** On a successful `verify_pin`, Rust records the authenticated user/role in `AuthSession` (`db/state.rs`, managed in `lib.rs`). Privileged commands MUST read the caller's role from `AuthSession` — **never** trust a role or user id passed as an IPC parameter. Frontend permission checks are UX only; the backend is the enforcement boundary.
- **Backend layout (`src-tauri/src/`):** `main.rs`/`lib.rs` (setup, managed state, handler registration), `db/schema.rs` (migrations), `db/state.rs` (`AppDb`, `AuthSession`), and `commands/` modules: `auth`, `invoice`, `purchase_order`, `customer`, `entry`, `settings`, `backup`, `admin`.
- **Frontend layout (`src/`):** `/routes` (Dashboard, Invoice/PO/Entry forms + lists, Reports, Login, SetupAdmin, User/Customer Management, Settings); `/admin` (Admin Center pages + `services/adminApi.ts`); `/hooks` (`useInvoices`, `usePurchaseOrders`, `useEntries`, `useSettings`, `useUpdater`); `/components` (UI primitives, `InvoicePreview`, `LineItemsTable`, `layout`); `/contexts` (`AuthContext`); `/lib` (utils, types, schemas, PDF/Excel).

## 3. Business Rules
- **Dual PO numbering:** Internal `po_number` (`PO/{seq}/{FY}`); the external `customer_po_no` becomes the invoice `buyer_order_no`. Never derive `buyer_order_no` from the internal sequence.
- **Delivery address mapping:** If a PO's `delivery_address` differs from `customer_address`, it overrides the invoice consignee fields; otherwise consignee = customer.
- **SA number & incoterm:** Toggle SA columns via `show_sa_number`. Always use `rateColumnLabel(incoterm, currency)` for rate labels — never hardcode strings (e.g. "EX WORK").
- **Tax:** Export under LUT is zero-rated (no GST on the invoice); LUT/ARN fields live in company settings.
- **Document generators:** Reuse helpers in `src/lib/invoiceDocument.ts` (`formatInvoiceDisplayDate`, `invoiceReferenceRows`, `fmtAmount`, `amountInWords`). PDF rendering lives in `components/InvoicePreview/PdfDocument.tsx` + `lib/pdf.ts`; Excel in `lib/excel.ts` and `lib/reportExcel.ts`.

## 4. RBAC & Status Lifecycles
- **Roles:** `admin`, `operator`, `viewer`. The permission matrix and helpers (`hasPermission`, `canEditInvoiceByStatus`, `canEditPurchaseOrderByStatus`) live in `src/lib/auth.ts`; the UI consumes them via `useAuth().can(...)` (`src/contexts/AuthContext.tsx`).
- **Invoice lifecycle:** `draft → final`. Operators may edit drafts; only admin may edit a `final` invoice, finalize, or delete.
- **PO lifecycle:** `draft → confirmed → closed`. Operators edit `draft`; only admin edits `confirmed`; `closed` is not editable.
- **Auth:** PINs are hashed with Argon2id in Rust (legacy SHA-256 auto-migrates on next verify). Lockout, a hash-chained auth audit log (`verify_audit_chain`), and telemetry are backend-owned. Settings and user management require `admin`.

## 5. Tauri Command Workflow
To add a backend command: (1) write the `#[tauri::command]` in the relevant `commands/*.rs` module, taking `State<AppDb>` for DB access; (2) for any privileged action, read the role from `State<AuthSession>` rather than from parameters; (3) **register it in the `tauri::generate_handler!` list in `lib.rs`** — a missing registration is the usual cause of "command not found"; (4) expose a typed wrapper on the frontend that calls `invoke("command_name", {...})`.

## 6. Database & Migration Safety
- **DB selection:** The active DB path is mirrored between `localStorage["db_path"]` and `%APPDATA%\com.exportinvoice.app\selected_db.txt`. Change it only via `setDbPath`/`clearDbPath` in `src/lib/db.ts`; a restart is required after switching. Migrations are registered for both the default and the selected DB URL, so a chosen file is migrated rather than opened empty.
- **Migrations:** Append a new `Migration` with the next sequential `version` in `db/schema.rs` — never edit or reorder existing migrations.
- **Backup/restore:** On startup the app applies any staged restore *before* migrations run, then takes a `pre-upgrade` snapshot so a bad migration is recoverable (`lib.rs`, `commands/backup.rs`). Use `backup_database` / `validate_and_stage_restore` rather than copying DB files ad hoc.

## 7. Workflows & Commands
Run from the project root:
- `npm run dev` — Vite dev server.
- `npm run tauri dev` — Tauri desktop app (dev).
- `npm run build` — `tsc` + Vite production build.
- `npm run test` / `npm run test:watch` — Vitest.
- **Release:** bump the `package.json` version, then `npm run tauri build`; the updater consumes the generated artifacts/manifest.

## 8. UI & Development Rules
- **Styling:** Tailwind CSS with the `cn()` helper from `src/lib/utils.ts`.
- **Testing:** Frontend tests live in `src/**/__tests__` (Vitest); Rust commands have inline `#[cfg(test)]` integration tests — update both sides when changing cross-cutting behavior.
- **Rust:** Follow Tauri v2 paradigms for commands and managed state.
