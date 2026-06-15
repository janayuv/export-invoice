---
name: export-doc
description: Trace the PDF and Excel export pipelines for a given invoice and produce a field-coverage comparison report. Flags fields rendered differently or missing between the two outputs. Read-only — never modifies source code. Arguments: invoice ID or description of the invoice to validate.
disable-model-invocation: false
---

# Export Document Validator

Use this skill to audit the consistency of the two export renderers for the Export-Invoice app.
This skill is **read-only** — it produces a report only, never modifies any source file.

Invoice to validate: $ARGUMENTS

---

## Shared helper contract

Both renderers MUST import and use these helpers from `src/lib/invoiceDocument.ts`:

| Helper | Purpose | Used in PDF | Used in Excel |
|--------|---------|-------------|---------------|
| `formatInvoiceDisplayDate(iso)` | Converts ISO date to DD.MM.YYYY | Check | Check |
| `invoiceReferenceRows(invoice, company)` | Produces reference label/value pairs | Check | Check |
| `rateColumnLabel(incoterm, currency)` | Column header for rate/amount columns | Check | Check |
| `amountInWords(amount, currency)` | Converts total to words | Check | Check |
| `fmtAmount(n, decimals?)` | Formats a number with fixed decimals | Check | not expected |

---

## Step 1 — Read both renderer files

Read these files in full:

- **PDF template:** `src/components/InvoicePreview/PdfDocument.tsx`
- **PDF entry point:** `src/lib/pdf.ts`
- **Excel entry point:** `src/lib/excel.ts`
- **Shared helpers:** `src/lib/invoiceDocument.ts`

Also read `src/lib/types.ts` to understand the `Invoice` and `CompanySettings` shape.

---

## Step 2 — Build the field inventory

Extract every `invoice.*` and `company.*` field reference from each renderer.
Organise into three categories:

### Header / metadata fields
Fields from the top section of the document (transport mode, invoice number, date, consignee, buyer, references).

### Line item fields
Fields rendered per item in `invoice.items[]` (sr_no, part_number, sa_number, description, quantity, unit_price, total_amount, marks_nos, no_of_pkgs, dimensions, dimensions_unit).

### Footer / summary fields
Totals, amount-in-words, packing list weight, LUT/ARN declaration, signatory.

---

## Step 3 — Compare outputs

For each field in the inventory, fill this table:

| Field path | PDF renders it | Excel renders it | Value / format match | Notes |
|------------|---------------|-----------------|---------------------|-------|
| `invoice.invoice_number` | yes | yes | Match | Both use raw value |
| `invoice.invoice_date` | yes (via formatInvoiceDisplayDate) | yes (via formatInvoiceDisplayDate) | Match | |
| `invoice.show_sa_number` | yes (column width toggle) | no | Mismatch | Excel has no SA column |

---

## Step 4 — Check helper usage

For each shared helper, verify:

1. **Both renderers import it** from `src/lib/invoiceDocument.ts` (not a local copy)
2. **Called with identical arguments** — e.g. `rateColumnLabel(invoice.incoterm, invoice.currency)` in both
3. **Result rendered consistently** — same position and label text

Flag any renderer that:
- Re-implements the helper logic inline instead of calling the shared function
- Calls the helper with different argument order or missing arguments
- Renders the result in a fundamentally different position or format

---

## Step 5 — Produce the report

Output the report in this format:

```
EXPORT VALIDATION REPORT
Invoice: <ID or description from $ARGUMENTS>
Reviewed: <date>

## Helper Usage
[PASS/WARN] formatInvoiceDisplayDate  — PDF yes  Excel yes
[PASS/WARN] invoiceReferenceRows       — PDF yes  Excel yes
[PASS/WARN] rateColumnLabel            — PDF yes  Excel yes
[PASS/WARN] amountInWords              — PDF yes  Excel yes
[PASS/WARN] fmtAmount                  — PDF yes  Excel no (expected: not used in Excel)

## Field Coverage
[MATCH]    invoice.invoice_number        — PDF yes  Excel yes  same value
[MATCH]    invoice.invoice_date          — PDF yes  Excel yes  formatInvoiceDisplayDate in both
[MISMATCH] invoice.show_sa_number        — PDF yes  Excel no   SA column absent in Excel
[MISSING]  invoice.pre_carrier           — PDF no   Excel no   defined in type but unused
...

## Summary
  Total fields checked: N
  Matching:            N
  Mismatches:          N  <- list each
  Missing from both:   N  <- list each
  Helper violations:   N  <- list each

## Recommendations
- <actionable fix for each mismatch, with file and line reference>
```

---

## Important constraints

- **Do not modify any source file.** This skill is for auditing only.
- If a mismatch is found, describe it precisely with file and line reference so a developer can act on it.
- If `show_sa_number` is false, the SA Number column being absent is intentional — note as "by design" not a mismatch.
- Rate column label differences (e.g. "EX WORK USD" vs just "USD") indicate a missing `rateColumnLabel` call — always flag these.

---

## Example

**Input:** `export-doc invoice ID 42 — standard USD shipment with SA numbers enabled`

**Expected output:** A full field-coverage table plus a summary section listing any helpers called inconsistently or fields missing from one renderer.
