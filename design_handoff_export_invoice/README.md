# Design Handoff: Export Invoice — Full UI Redesign

## Overview

This package contains a **high-fidelity interactive prototype** of the Export Invoice desktop app redesign. The prototype was built from a deep study of the real codebase (see `claude.md` in the repo root) and covers every major screen.

**Target stack:** Tauri 2.0 · React 19 · TypeScript 5.8 · Tailwind CSS 3.4 · shadcn/ui · React Router 6 · React Hook Form 7 · Zod 4 · Lucide React · Sonner

---

## About the Design Files

The `.html` files in this bundle are **design references built in plain React/Babel** — not production code. Do **not** copy them directly. Your task is to **recreate each screen in the existing Tauri + React + TypeScript codebase**, using its established patterns (shadcn/ui components, Tailwind classes, React Router `<NavLink>`, React Hook Form, etc.).

**Fidelity:** High-fidelity. Pixel-accurate colors, spacing, typography, and interactions. Recreate as closely as possible using the codebase's design system.

---

## Design Files in This Package

| File | Purpose |
|---|---|
| `Export Invoice.html` | Main entry — open in a browser to explore the full prototype |
| `components.jsx` | Base UI components + mock data (reference only) |
| `invoice-screens.jsx` | Invoice list, new form, detail + PDF preview (reference only) |
| `app-screens.jsx` | Login, dashboard, PO list, settings (reference only) |

**How to view the prototype:** Open `Export Invoice.html` in Chrome or Edge. Click any user card on the login screen, type any 6 digits, then navigate freely using the sidebar.

---

## Design Tokens

### Color Palette (Dark Mode — primary target)

```css
/* Backgrounds */
--bg:         #09090b   /* page background */
--bg-sub:     #0c0c0f   /* slightly elevated (main content area) */
--bg-card:    #18181b   /* card / sidebar */
--bg-sidebar: #0f0f12   /* sidebar */
--bg-hover:   #27272a   /* row hover, active states */

/* Borders */
--border:     #27272a   /* default subtle border */
--border-mid: #3f3f46   /* stronger border (inputs, separators) */

/* Text */
--text:       #fafafa   /* primary */
--text-2:     #a1a1aa   /* secondary / muted */
--text-3:     #52525b   /* tertiary / placeholder */

/* Primary accent (indigo) */
--primary:        #818cf8
--primary-hover:  #a5b0fa
--primary-dim:    rgba(129,140,248,0.13)   /* tinted backgrounds */

/* Semantic */
--success:    #4ade80 / dim: rgba(74,222,128,0.13)
--warning:    #fbbf24 / dim: rgba(251,191,36,0.13)
--danger:     #f87171 / dim: rgba(248,113,113,0.13)
--amber:      #fbbf24 / dim: rgba(251,191,36,0.13)   /* admin role */
--blue:       #60a5fa / dim: rgba(96,165,250,0.13)   /* operator role */
```

In Tailwind/shadcn terms, map these to your existing `--primary`, `--card`, `--muted` etc. tokens. The existing `index.css` already defines these in oklch — the prototype uses equivalent hex values for browser compatibility.

### Typography

| Token | Value | Used for |
|---|---|---|
| `font-xs` | 11px | labels, uppercase tags |
| `font-sm` | 12px | table cells, inputs, badges |
| `font-base` | 13px | body text |
| `font-md` | 14px | card titles |
| `font-lg` | 16px | section headings |
| `font-xl` | 20px | page titles |

Font family: **Geist Variable** (already in the codebase). Monospace: **JetBrains Mono** or `font-mono` for invoice numbers, amounts, codes.

### Spacing (Dense mode — default)

| Token | Value |
|---|---|
| `pad-page` | 18px (page padding) |
| `gap` | 12px (grid / stack gap) |
| `radius` | 6px |

### Density toggle

The prototype supports two densities via a CSS attribute (`data-density="dense|comfortable"`). Dense is the default. In the actual app, expose this as a setting in Settings page, stored in localStorage, applied as a class on `<body>` or `<html>`.

---

## Screen-by-Screen Specification

---

### 1. Login Screen (`LoginScreen.tsx`)

**Route:** `/login` (shown before auth, replaces current `LoginScreen.tsx`)

**Layout:** Full-viewport centered dark background (`#09090b`). Single card centered both axes.

**Card:**
- Width: 396px max, padding: 32px top/sides, 28px bottom
- Background: `--bg-card` (`#18181b`)
- Border: 1px solid `--border` (`#27272a`)
- Border-radius: 16px
- Box-shadow: `0 20px 60px rgba(0,0,0,0.25)`

**Card contents (top → bottom):**
1. **Logo icon** — 52×52px rounded-[14px] square, background `--primary-dim`, color `--primary`. Use a box/package SVG (Lucide `<Package>` icon at 22px).
2. **Title** — "Export Invoice", 22px, font-weight 800, centered, margin-bottom 5px
3. **Subtitle** — "Select your profile and enter PIN to sign in", 13px, `--text-2`, centered, margin-bottom 22px
4. **User cards** — flex row, gap 8px, full-width. One card per user from `users` table.
   - Card: flex-col, align-items center, gap 5px, padding 10px 6px
   - Border: 1.5px solid `--border`, border-radius 10px, background `--bg-sub`
   - Hover: border → `--border-mid`, background → `--bg-hover`
   - Active/selected: border → `--primary`, background → `--primary-dim`
   - Contents: Avatar circle (34px, letter initial), user first name (11px bold), role Badge
5. **PIN dots** — 6 circles, gap 10px, shown after user selected
   - Empty: 13×13px circle, border 2px solid `--border-mid`
   - Filled: background `--primary`, border-color `--primary`, scale(1.1)
6. **Numeric keypad** — 3-column grid, gap 8px, width 224px
   - Each key: 46px tall, border-radius 10px, border 1px solid `--border`, background `--bg-sub`, font-size 18px, font-weight 600
   - Hover: background → `--bg-hover`
   - Active press: `transform: scale(0.95)`
   - Empty cell (position 10): transparent/invisible
   - Backspace (position 12): `⌫` character or Lucide `<Delete>`
7. **Hint text** — "Type any 6 digits — this is a demo" (11px, `--text-3`, centered) — remove in production

**Behavior:**
- Selecting a user highlights their card; shows PIN dots + keypad
- Each digit press fills next dot; at 6 digits, auto-submit after 80ms timeout
- Wrong PIN: shake animation (`translateX` left/right) on card, clear PIN
- Correct PIN: set auth state, navigate to `/dashboard`
- PIN hashing: SHA-256 of PIN → compare with `users.pin_hash` in DB

**Shake animation (already exists in codebase):**
```css
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-8px); }
  40% { transform: translateX(8px); }
  60% { transform: translateX(-6px); }
  80% { transform: translateX(6px); }
}
```

---

### 2. Layout / Sidebar (`Layout.tsx`)

**File:** `src/components/layout/Layout.tsx` — **replace entirely**.

**Shell:** `display: flex; height: 100vh; overflow: hidden`

#### Sidebar

**Widths:**
- Expanded: 218px
- Collapsed: 52px (icon-only)
- Transition: `width 0.22s cubic-bezier(0.4,0,0.2,1)`

**Background:** `--bg-sidebar` (`#0f0f12`), right border 1px `--border`

**Logo area** (height 52px, border-bottom 1px `--border`):
- 27×27px rounded-[7px] icon box (`--primary-dim` bg, `--primary` color) with Lucide `<Package>` at 14px
- "Export Invoice" text (13px, font-weight 700) + "v{appVersion}" (10px, `--text-3`)
- In collapsed mode: only show icon box

**Nav sections:** Same sections as current code. Each section:
- Section label: 10px, font-weight 700, UPPERCASE, letter-spacing 0.08em, `--text-3`, padding 10px 14px 3px
  - Hide in collapsed mode
- Nav items: flex row, gap 8px, padding 6px 8px, border-radius 6px, margin 1px 6px
  - Default: `--text-2`, font-size 12px
  - Hover: background `--bg-hover`, color `--text`
  - Active: background `--primary-dim`, color `--primary`, font-weight 600
  - Active indicator: 5×5px circle dot (right-aligned), background `--primary`
  - Icon container: 20px fixed width, centered
  - In collapsed mode: hide label + dot, show only icon (use `title` attr for tooltip)

**Bottom area** (border-top 1px `--border`):
- Theme toggle nav-item (same styling as nav items)
  - Shows sun icon in dark mode ("Light Mode"), moon icon in light mode ("Dark Mode")
  - Replace existing `ThemeToggle` component behavior

**User area** (border-top 1px `--border`, padding 8px 6px):
- Inner row: flex, gap 8px, padding 6px 8px, border-radius 6px, background `--bg-hover`
- 26px letter-avatar circle (`--primary-dim` bg, `--primary` text)
- User name (12px, font-weight 600, truncated) + role Badge
- Logout button: ghost icon button with Lucide `<LogOut>` at 12px
- In collapsed mode: show only avatar circle

**Main content area:** `flex: 1; overflow-y: auto; overflow-x: hidden`

---

### 3. Dashboard (`Dashboard.tsx`)

**Route:** `/dashboard`

**Page padding:** 18px

**Content (top → bottom, gap 12px):**

1. **Greeting + date** (no card wrapper):
   - H1: "Good morning/afternoon/evening, {firstName}" — 20px, bold 700, `--text`
   - Subtitle: full date (weekday, day, month, year) — 11px, `--text-2`

2. **4 stat cards** (CSS grid, 4 columns, gap 12px):

   | Card | Icon | Color |
   |---|---|---|
   | Total Invoices | `<FileText>` | neutral (gray) |
   | This Month | `<Calendar>` | primary (indigo) |
   | Draft | `<Edit>` | warning (amber) |
   | Finalized | `<CheckCircle>` | success (green) |

   Each stat card:
   - Card: background `--bg-card`, border 1px `--border`, border-radius 8px
   - Padding: 14px
   - Label: 10px, font-weight 700, UPPERCASE, letter-spacing 0.06em, `--text-2`
   - Icon box: 28×28px, border-radius 6px, colored bg + icon
   - Value: 28px, font-weight 700, colored, letter-spacing -0.5px
   - Sub: 11px, `--text-3`
   - Hover: `transform: translateY(-1px)`, subtle shadow (clickable → navigates to invoices)

3. **Quick actions** (flex row, gap 8px):
   - "New Invoice" — primary button (md size)
   - "View All Invoices" — outline button
   - "Purchase Orders" — outline button

4. **Two-column grid** (grid-cols-2, gap 12px):

   **Left: Recent Invoices card**
   - Card header: "Recent Invoices" title + "View all →" ghost link button
   - Table: last 5 invoices (Invoice No | Consignee | Amount | Status)
   - Invoice No: monospace, `--primary` color
   - Rows are clickable → Invoice Detail

   **Right: Two stacked mini cards**
   
   *Export Volume chart (12-month bar)*
   - 12 evenly-spaced bars, height 72px container
   - Bars: `--primary-dim` fill, current month `--primary` fill
   - Border-radius: 3px top corners only
   - Month labels below: Jun '25 | Dec '25 | May '26

   *By Destination breakdown*
   - Per destination: label + invoice count (right-aligned) + progress bar (height 5px)
   - Progress bar track: `--bg-hover`, fill: colored per destination
   - Colors: South Korea → `--primary`, UAE → `--warning`, Germany → `--success`

---

### 4. Invoice List (`InvoiceList.tsx`)

**Route:** `/invoices`

**Page padding:** 18px. Stack gap: 12px.

**Page header:**
- Left: "Invoices" (h1, 20px bold) + "{n} invoices total" (11px, `--text-2`)
- Right: "Refresh" outline button + "New Invoice" primary button

**Filter bar** (flex row, gap 8px):
- Search input (max-width 340px): 12px font, left-padded for search icon, placeholder "Search invoice #, consignee, buyer order…"
- Status select (width 140px): "All Status | Draft | Final"

**Table** (inside a card, no internal padding):

| Column | Width | Style |
|---|---|---|
| Invoice No | auto | Monospace, `--primary` color, font-weight 600 |
| Date | auto | `--text-2`, formatted as DD.MM.YYYY |
| Mode | auto | Small chip: bg `--bg-hover`, `--text-2`, 10px, font-weight 600, padding 2px 7px, border-radius 4px. Show abbreviated: "SEA", "AIR", "ROAD", "COURIER" |
| Consignee | auto | font-weight 600 |
| Destination | auto | `--text-2` |
| Cur | 60px | Monospace, 11px, `--text-2` |
| Amount | auto | Right-aligned, monospace |
| Status | auto | Badge |

**Table rows:** cursor pointer, hover background `--bg-hover`. Click → navigate to Invoice Detail.

**Table header:** 11px, UPPERCASE, font-weight 700, letter-spacing 0.06em, `--text-2`, border-bottom 1px `--border`.

**Empty state:** Centered icon + "No invoices found" + contextual sub-text + "New Invoice" button.

**Status badges:**
- Final: `--primary-dim` bg, `--primary` text
- Draft: `--warning-dim` bg, `--warning` text

---

### 5. Invoice New/Edit Form (`InvoiceNew.tsx`)

**Route:** `/invoices/new` and `/invoices/:id/edit`

**Layout:** Full-height flex column (no page scroll — internal scroll only)

#### Sticky header (height ~56px)

Flex row, space-between, padding 10px 16px, background `--bg-card`, border-bottom 1px `--border`.

**Left:** Back icon button (ghost) + Title ("New Invoice" or "Edit Invoice") + invoice number badge (monospace, `--primary-dim` bg, `--primary` text, pill shape)

**Right buttons:** Cancel (ghost) | Save Draft (outline) | Finalize (primary)

#### Two-panel body (flex row, `overflow: hidden`, `flex: 1`)

**Left: Section TOC** (width 168px, fixed, `overflow-y: auto`, background `--bg-card`, border-right 1px `--border`)

7 items: Customer & PO | Invoice Details | Consignee | Shipping | Goods | Packing | Weight & Notes

Each item:
- Padding: 7px 10px, border-radius 6px, font-size 12px
- Default: `--text-2`
- Hover: `--bg-hover`, `--text`
- Active: `--primary-dim` bg, `--primary` text, font-weight 600
- Leading icon (Lucide) 12px

Clicking a TOC item scrolls right panel to that section (using `scrollIntoView` equivalent — use `ref.current?.scrollIntoView({behavior: 'smooth', block: 'start'})`).

**Right: Scrollable form** (`overflow-y: auto`, `flex: 1`, padding 18px, background `--bg-sub`)

Each section is a card (`--bg-card` bg, 1px `--border` border, border-radius 8px, padding 14px).

**Section header pattern:**
```
[26px icon box] Section Title (14px, bold)
               Section description (11px, --text-2)
```
Border-bottom 1px `--border` below header, margin-bottom 14px.

**Section grids:**
- 2 cols: Customer & PO, Consignee (left/right halves), Weight & Notes
- 3 cols: Invoice Details (most fields), Shipping
- Fields are `<Field>` components: label (10px uppercase `--text-2`) + input

**Form field specs:**
- Label: 10px, font-weight 700, UPPERCASE, letter-spacing 0.06em, `--text-2`
- Input: background `--bg-sub`, border 1px `--border`, border-radius 6px, padding 5px 9px, font-size 12px
- Input focus: border-color `--primary`, box-shadow `0 0 0 2px --primary-dim`
- Readonly input: opacity 0.65
- Monospace inputs (Invoice No, GSTIN, codes): `font-family: monospace`

**Goods table** (inside Goods section, horizontally scrollable):

Columns: Sr | SA# (if show_sa_number) | Part No. | Description | Marks | Pkgs | Qty | Unit | Rate ({currency}) | Amount | [remove]

- Compact rows: `td` padding 4px 7px
- Inputs inside cells: `padding: 3px 6px; font-size: 11px`
- Part No / Amount: monospace
- Footer row: "Add Item" ghost button + right-aligned total amount in `--primary` bold
- "Show SA #" checkbox in section header (right-aligned)

**Packing List table** (inside Packing section):

Columns: Sr | Marks & Nos | No. of Pkgs | Dimensions | Unit | [remove]

**Weight & Notes** section: 2-col grid for net/gross weight, then full-width notes textarea (3 rows).

---

### 6. Invoice Detail (`InvoiceDetail.tsx`)

**Route:** `/invoices/:id`

**Page padding:** 18px, gap 12px.

**Page header:**
- Left: back button + invoice number (20px bold) + "consignee · DD.MM.YYYY · currency" subtitle
- Right: Status badge | Edit | Finalize | Export PDF | Export Excel | Delete

Finalize: primary button (only shown if status=draft + user has `finalize_invoice` permission)
Delete: danger button (only shown if user has `delete_invoice` permission)

**Invoice PDF Preview** (below header):

The preview renders the invoice as an HTML document styled to look like the actual A4 PDF export. This is a pure HTML replica — not an iframe of the real PDF.

**Outer wrapper:** Background `#c0c0c0` (light gray "desk"), padding 24px, border-radius 4px, overflow-x: auto.

**Document:** White background, black 1.5px border, font-family Courier New/monospace, font-size 8.5pt, max-width 760px, centered.

Document sections (all in black borders, no border-radius):

1. **Header row** (3 cells, flex, border-bottom 1.5px black):
   - Logo cell (35% width, border-right 1.5px): Company name in bold
   - Title cell (flex-1, centered): "INVOICE CUM PACKING LIST" in 11pt, font-weight 800
   - Mode cell (19% width, border-left 1.5px, centered): "TRANSPORT MODE" label + mode value

2. **Exporter + References** (flex row, border-bottom 1.5px):
   - Left (48%, border-right 1.5px): EXPORTER label + company name (bold 9pt) + address (8pt, pre-line) + GSTIN/IEC/PAN
   - Right (52%): 6 reference rows (label | value pairs), separated by 1px `#d0d0d0` borders. First row (Invoice No & Date) has `#eef0ff` highlight background, value in indigo `#312e81`, 8.5pt.

3. **Consignee + Buyer** (flex row, border-bottom 1.5px):
   - Left (50%, border-right 1.5px): Consignee name (bold 9pt) + address + shipping rows (Pre-carriage, Place, Vessel, Port of Loading, Port of Discharge, Final Destination)
   - Right (50%): Buyer field + Country of Origin/Destination, Terms, Incoterm

4. **GOODS table** (full-width, border-collapse, all borders 1px black):
   - Header: bg `#ececec`, font-weight 700, 8pt
   - Columns: Sr | [SA No.] | Part No. | Description | Qty | Rate\n(rateLabel) | Amount\n(currency)
   - SA# column only if `show_sa_number = true`
   - Total row: bg `#f5f5e8`, borders 1px black, bold
   - Part numbers: monospace

5. **Amount in words row:** padding 6px 9px, font-size 8pt, italic, bg `#fbfbf5`, border-top/bottom 1.5px black

6. **PACKING LIST section bar:** 5px 9px, font-weight 700, 9pt, letter-spacing 0.12em, bg `#e4e4e4`, border-top 1.5px, border-bottom 1px black

7. **Packing table:** same border style, columns: Sr | Marks & Nos | No. of Pkgs | Dimensions | Unit

8. **Weight bar:** Net Weight + Gross Weight, flex row, gap 32px, 5px 9px, 8pt, border-bottom 1.5px black

9. **Footer row** (flex, min-height 90px):
   - Left (~68%, border-right 1.5px): LUT/ARN declaration text + certification
   - Right (32%): "For {company name}" + signature line + Place + Date + AUTHORIZED SIGNATORY

**Implementation note:** The `InvoicePreview` component at `src/components/InvoicePreview/index.tsx` already provides this HTML preview. Refactor it to match these exact styles rather than replacing it entirely.

---

### 7. Purchase Order List (`PurchaseOrderList.tsx`)

Same pattern as Invoice List. Columns:

| Column | Style |
|---|---|
| Customer PO No | Monospace, `--primary` color |
| Internal Ref | `--text-2` |
| Date | `--text-2`, DD.MM.YYYY |
| Customer | font-weight 600 |
| Currency | Monospace, 11px |
| Status | Badge (confirmed=green, draft=amber, closed=neutral) |

---

### 8. Settings (`Settings.tsx`)

**Route:** `/settings`

**Layout:** Page header + vertical stack of 4 cards (gap 14px).

**Page header:** "Settings" + "Company information and export configuration" subtitle. Right: "Saved successfully" (green text, shown briefly) + "Save Changes" primary button.

**Card structure:** Each card has a card-header (`--bg-card`, border-bottom `--border`) with section icon + title + description, and a card-body with form fields.

**Card 1 — Exporter Information:**
- 2-col grid: Company Name, GSTIN, PAN, IEC
- Full-width below: Address (textarea, 3 rows)
- Icon: Lucide `<Building2>`

**Card 2 — Banking & Export Details:**
- 3-col grid: Bank Name, Account Number (mono), IFSC (mono), SWIFT (mono), AD Code (mono), [empty], LUT ARN Number (mono), LUT ARN Date (date input)
- Icon: Lucide `<Scale>`

**Card 3 — Signatory Details:**
- 2-col grid: Place, Signatory Name
- Icon: Lucide `<UserCheck>`

**Card 4 — Company Logo:**
- Upload area: 80×56px dashed border box (2px dashed `--border-mid`, border-radius 6px) with building icon + "No logo" text
- "Upload Logo" outline button + description text (11px, `--text-3`)
- When logo set: show preview image + "Remove" button
- Icon: Lucide `<Building2>`

---

## Component Mapping: Prototype → Codebase

| Prototype component | Real codebase equivalent |
|---|---|
| `Btn v="default"` | shadcn `<Button>` (default variant) |
| `Btn v="outline"` | shadcn `<Button variant="outline">` |
| `Btn v="ghost"` | shadcn `<Button variant="ghost">` |
| `Btn v="danger"` | shadcn `<Button variant="destructive">` |
| `Badge` | shadcn `<Badge>` with custom variant classes |
| `Inp` | shadcn `<Input>` |
| `UiText` | shadcn `<Textarea>` |
| `UiSel` | shadcn `<Select>` |
| `UiCard` | shadcn `<Card>` |
| `Field` | custom `<Field>` (already in `InvoiceNew.tsx`) |
| `PageHeader` | custom — build as reusable component |
| `EmptyState` | custom — build as reusable component |
| Toast notifications | Sonner `toast.success()` / `toast.error()` (already wired) |
| Icons | Lucide React (already installed) |

---

## Interactions & Animations

### Page transitions
Fade + slight upward translate on route change:
```css
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
```
Apply to page wrapper on mount.

### Sidebar collapse
Width transition: `width 0.22s cubic-bezier(0.4,0,0.2,1)`. Collapse state stored in localStorage (`sidebar_collapsed`).

### Table rows
Hover: `background: var(--bg-hover)`. Transition: `background 0.08s`.

### Stat cards
Hover: `transform: translateY(-1px)`, mild box-shadow elevation. Cursor pointer.

### Nav items
Hover/active background: `transition: background 0.1s, color 0.1s`.

### PIN dot fill
On digit press: `transform: scale(1.1)`, `background: var(--primary)`. Transition 0.1s.

### Toast (Sonner)
Already configured with `<Toaster richColors position="top-right" />`. No changes needed.

---

## Density System

Add a density preference to `Settings.tsx` (stored in localStorage as `ui_density`). Apply as a CSS class or data attribute on `<html>`:

```ts
// On app mount and on settings change:
document.documentElement.setAttribute('data-density', density); // 'dense' | 'comfortable'
```

CSS variables per density (add to `index.css`):
```css
[data-density="dense"] {
  --pad-page: 18px;
  --gap: 12px;
  --font-page-title: 20px;
}
[data-density="comfortable"] {
  --pad-page: 28px;
  --gap: 18px;
  --font-page-title: 24px;
}
```

---

## State Management Notes

### Sidebar collapse
```ts
// In Layout.tsx
const [collapsed, setCollapsed] = useLocalStorage('sidebar_collapsed', false);
```

### Density preference
Add to `CompanySettings` type or use a separate localStorage key.

### Theme toggle
Already implemented via `ThemeToggle.tsx`. The sidebar "Light Mode / Dark Mode" button should call the same toggle function.

---

## Scrollbar Styling

```css
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-mid); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-3); }
```

---

## Implementation Priority

1. **Layout.tsx** — sidebar redesign affects every page
2. **Dashboard.tsx** — most visible, good first win
3. **InvoiceList.tsx** — high-traffic screen
4. **InvoiceNew.tsx** — most complex, two-panel form with TOC
5. **InvoiceDetail.tsx** — PDF preview refactor
6. **PurchaseOrderList.tsx** — simple, same pattern as InvoiceList
7. **Settings.tsx** — last (less frequent use)
8. **LoginScreen.tsx** — self-contained, low risk

---

## What NOT to Change

- Tauri commands and SQLite hooks (all `useInvoices`, `usePurchaseOrders`, `useSettings`, `useAuth`)
- Business logic in `src/lib/` (pdf.ts, excel.ts, invoiceDocument.ts, invoiceFromPo.ts, auth.ts)
- Zod schemas and TypeScript types
- The shadcn/ui primitive components in `src/components/ui/`

Only the **visual layer** (route components + Layout) needs updating.

---

## Claude Code Suggested Prompt

After downloading this package, open your terminal in the repo root and start Claude Code with:

```
claude
```

Then paste:

```
I have a design handoff package at ./design_handoff_export_invoice/. Please read README.md thoroughly, then open Export Invoice.html in a browser tab so I can reference it.

Start with Layout.tsx — implement the new sidebar design described in section "2. Layout / Sidebar". Use the existing shadcn/ui components, Tailwind classes, and Lucide React icons. Match the exact colors, spacing, and behavior from the README. Do not touch any hooks, lib files, or Tauri commands.
```

Work screen by screen following the priority order above.
