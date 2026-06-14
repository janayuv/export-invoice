# Premium Dashboard Redesign

**Date:** 2026-06-15  
**Status:** Approved  
**File:** `src/routes/Dashboard.tsx`

---

## Design Decisions

| Dimension | Choice |
|---|---|
| Visual style | Clean Light — white cards, subtle shadow, Notion/Linear feel |
| Layout | 3-column grid with activity feed |
| Export value | Per-currency breakdown (no conversion) |

---

## Layout Structure

```
┌─────────────────────────────────────────────────────────┐
│  Good morning, Jana        [Invoices] [POs] [+New]      │
├──────────┬──────────┬──────────────────┬────────────────┤
│  Total   │  Month   │  Export Value    │  Drafts        │
│  48      │  7 ▲+2   │  $42.5K USD      │  3 ⚡          │
│          │          │  €18.3K EUR      │  amber border  │
│          │          │  £9.1K GBP       │                │
├──────────┴──────────┴──────────────────┴────────────────┤
│  Recent Invoices (2fr)  │  Charts (1.3fr) │ Activity(1fr)│
│  5 rows, 4-col table    │  Bar chart      │ Timeline     │
│                         │  Destinations   │ dots+lines   │
└─────────────────────────────────────────────────────────┘
```

---

## KPI Cards (row 2)

Four cards in `grid-template-columns: repeat(4, 1fr)`.

### Card 1 — Total Invoices
- Value: count of all invoices
- Sub-label: "all time"
- Icon: FileText on `bg-zinc-100`
- Mini progress bar: grey fill, width = `min(total / 100, 1) * 100%`
- No trend (cumulative metric)

### Card 2 — This Month
- Value: count where `strftime('%Y-%m', invoice_date) = strftime('%Y-%m', 'now')`
- Sub-label: current month name
- Icon: Calendar on `bg-indigo-50`
- Trend vs last month: `▲ +N vs last month` in emerald if positive, `▼ −N` in red if negative
- Mini progress bar: indigo fill, width = `(thisMonth / max(thisMonth, lastMonth, 1)) * 100%`
- Requires additional query for last month count

### Card 3 — Export Value (this month)
- Label: "Export Value · [Month Name]"
- Icon: DollarSign on `bg-green-50`
- Query joins `invoice_items` → `invoices`, groups by `currency`, orders by `SUM(total_amount) DESC`, limit 3
- Render: stacked — largest currency 18px bold green, next 13px grey, third 11px grey
- Empty state: "—" if no invoices this month

### Card 4 — Drafts
- Value: count where `status = 'draft'`
- Icon: Pencil on `bg-amber-50`
- Card border override: `border-amber-200`
- Sub-label: "⚡ pending finalization"
- Clickable → `/invoices`

---

## Bottom Grid: 3 Columns

`grid-template-columns: 2fr 1.3fr 1fr`

### Column 1 — Recent Invoices Table

5 rows ordered by `created_at DESC`.

| Column | Source | Style |
|---|---|---|
| Invoice No | `invoice_number` | indigo, monospace |
| Consignee | `consignee_name` | truncate ellipsis |
| Amount | `currency + total` | right-aligned, monospace |
| Status | `status` | pill badge |

Header row with uppercase 9px labels. Each row clickable → `/invoices/:id`.

Badges: FINAL = `bg-green-100 text-green-700 rounded-full`, DRAFT = `bg-amber-100 text-amber-700 rounded-full`.

### Column 2 — Charts (stacked)

**Export Volume (top)**
- SVG, `viewBox="0 0 220 80"`
- Horizontal grid lines at 25/50/75% height in `#f3f4f6`
- 12 bars. Current month: `fill="#6366f1"`. Past: `fill="#e0e7ff"`
- X-axis: 3 labels — first, middle, current (current in indigo bold)
- Bar height: `max(4, round((count / maxCount) * 100))%`

**By Destination (bottom)**
- Top 5 countries by invoice count
- 5px progress bars, indigo gradient darkest→lightest: `#6366f1 #818cf8 #a5b4fc #c7d2fe #e0e7ff`

### Column 3 — Activity Feed

Merged invoice + PO events, `ORDER BY created_at DESC LIMIT 8`.

**Query:**
```sql
SELECT 'invoice' as entity, invoice_number as ref,
       consignee_name as name, status, created_at
FROM invoices
UNION ALL
SELECT 'po', po_number, customer_name, status, created_at
FROM purchase_orders
ORDER BY created_at DESC
LIMIT 8
```

**Dot colours:**
- Invoice draft → indigo `#6366f1`
- Invoice final → emerald `#10b981`
- PO → amber `#f59e0b`

**Label logic:**
- Invoice final → `"INV/001 finalized"`
- Invoice draft → `"INV/001 created"`
- PO → `"PO/001 created"`

Each event: dot + vertical connector line (last event has no connector).

Note: no `status_changed_at` column — "finalized" label derived from `status = 'final'` at query time, not from a change event.

---

## New TypeScript Types

```typescript
interface CurrencyTotal {
  currency: string;
  total: number;
}

interface ActivityEvent {
  entity: 'invoice' | 'po';
  ref: string;
  name: string;
  status: string;
  created_at: string;
}

// Extend existing Stats
interface Stats {
  total: number;
  thisMonth: number;
  lastMonth: number;   // new
  drafts: number;
  finals: number;
}
```

---

## Relative Time Helper

Add to `src/lib/utils.ts`:

```typescript
export function relativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffH = Math.floor(diffMs / 3_600_000);
  if (diffH < 1) return 'just now';
  if (diffH < 24) return `${diffH} hour${diffH > 1 ? 's' : ''} ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'yesterday';
  return `${diffD} days ago`;
}
```

---

## Visual Tokens

| Element | Tailwind |
|---|---|
| Card base | `bg-white border border-zinc-200 rounded-[10px] p-[14px] shadow-sm` |
| Drafts card border | `border-amber-200` |
| KPI number | `text-[32px] font-black leading-none tracking-[-1px]` |
| Invoice No | `font-mono font-bold text-indigo-500 text-[11px]` |
| FINAL badge | `bg-green-100 text-green-700 text-[9px] font-bold px-[7px] py-[2px] rounded-full` |
| DRAFT badge | `bg-amber-100 text-amber-700 text-[9px] font-bold px-[7px] py-[2px] rounded-full` |
| Activity dot | `w-[7px] h-[7px] rounded-full` |
| Connector | `w-px bg-zinc-200 flex-1 mt-[3px]` |

---

## Out of Scope

- Exchange rate conversion
- DB migrations (zero required)
- Dark mode rework (existing dark tokens preserved)
- Pagination on widgets
- Filtering/sorting on dashboard
