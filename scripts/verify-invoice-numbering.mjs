/**
 * Verification script for the invoice-number sequencing fix.
 *
 * Uses node:sqlite (built-in, Node >= 22.5) with an in-memory DB.
 * Replicates the exact SQL from useInvoices.ts: generateInvoiceNumber (peek),
 * allocateInvoiceNumber (commit), createInvoice, and deleteInvoice.
 *
 * Run with: node scripts/verify-invoice-numbering.mjs
 */

import { DatabaseSync } from "node:sqlite";

// ─── DB setup (mirrors migrations 2 + 4 from schema.rs) ─────────────────────

const db = new DatabaseSync(":memory:");

db.exec(`
  CREATE TABLE invoice_sequence (
    year         INTEGER PRIMARY KEY,
    last_number  INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE invoices (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT NOT NULL UNIQUE,
    invoice_date   TEXT NOT NULL
  );
`);

// ─── Helpers (exact SQL from useInvoices.ts) ──────────────────────────────────

function getFiscalYear(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const fyStart = month >= 4 ? year : year - 1;
  const fyEnd = fyStart + 1;
  return { fyStart, fyLabel: `${fyStart}-${String(fyEnd).slice(-2)}` };
}

/** generateInvoiceNumber — read-only peek, no DB write */
function peekNextInvoiceNumber(date) {
  const { fyStart, fyLabel } = getFiscalYear(date ?? new Date());
  const row = db.prepare("SELECT last_number FROM invoice_sequence WHERE year = ?").get(fyStart);
  const next = row ? row.last_number + 1 : 1;
  return `EXP/${next}/${fyLabel}`;
}

/** allocateInvoiceNumber — committed write, called only inside createInvoice */
function allocateInvoiceNumber(invoiceDate) {
  const { fyStart, fyLabel } = getFiscalYear(invoiceDate);
  db.prepare("INSERT OR IGNORE INTO invoice_sequence (year, last_number) VALUES (?, 0)").run(fyStart);
  db.prepare("UPDATE invoice_sequence SET last_number = last_number + 1 WHERE year = ?").run(fyStart);
  const row = db.prepare("SELECT last_number FROM invoice_sequence WHERE year = ?").get(fyStart);
  return `EXP/${row.last_number}/${fyLabel}`;
}

/** createInvoice — allocates number internally, ignores any preview value */
function createInvoice(invoiceDate) {
  const invoiceNumber = allocateInvoiceNumber(invoiceDate);
  const isoDate = invoiceDate.toISOString().split("T")[0];
  db.prepare("INSERT INTO invoices (invoice_number, invoice_date) VALUES (?, ?)").run(invoiceNumber, isoDate);
  return invoiceNumber;
}

/** deleteInvoice — recalculates sequence from remaining rows after delete */
function deleteInvoice(invoiceNumber) {
  db.prepare("DELETE FROM invoices WHERE invoice_number = ?").run(invoiceNumber);
  const parts = invoiceNumber.split("/");
  if (parts.length === 3 && parts[0] === "EXP") {
    const fyLabel = parts[2];
    const fyStart = parseInt(fyLabel.split("-")[0], 10);
    if (!isNaN(fyStart)) {
      db.prepare(`
        UPDATE invoice_sequence
        SET last_number = COALESCE(
          (SELECT MAX(CAST(SUBSTR(invoice_number, 5,
             INSTR(SUBSTR(invoice_number, 5), '/') - 1) AS INTEGER))
           FROM invoices WHERE invoice_number LIKE 'EXP/%/' || ?),
          0)
        WHERE year = ?
      `).run(fyLabel, fyStart);
    }
  }
}

function seqState(fyStart) {
  const row = db.prepare("SELECT last_number FROM invoice_sequence WHERE year = ?").get(fyStart);
  return row ? row.last_number : "(no row)";
}

function allInvoices() {
  return db.prepare("SELECT invoice_number FROM invoices ORDER BY id").all().map(r => r.invoice_number);
}

// ─── Test scenario ─────────────────────────────────────────────────────────────

const TODAY = new Date("2026-05-18"); // current date from system context
const { fyStart, fyLabel } = getFiscalYear(TODAY);

let pass = true;

function assert(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) pass = false;
  console.log(`  ${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) console.log(`       expected: ${expected}\n       got:      ${actual}`);
}

console.log(`\nFiscal year: ${fyLabel}  (fyStart=${fyStart})\n`);

// Step 1: Peek three times without opening or saving — sequence must stay untouched
console.log("1. Peek (form open) x3 — no DB writes");
const p1 = peekNextInvoiceNumber(TODAY);
const p2 = peekNextInvoiceNumber(TODAY);
const p3 = peekNextInvoiceNumber(TODAY);
assert("peek 1 returns EXP/1/2026-27", p1, `EXP/1/${fyLabel}`);
assert("peek 2 returns EXP/1/2026-27", p2, `EXP/1/${fyLabel}`);
assert("peek 3 returns EXP/1/2026-27", p3, `EXP/1/${fyLabel}`);
assert("sequence not touched (no row)", String(seqState(fyStart)), "(no row)");

// Step 2: Create first invoice
console.log("\n2. Create first invoice (EXP/1)");
const num1 = createInvoice(TODAY);
assert("allocated number is EXP/1/2026-27", num1, `EXP/1/${fyLabel}`);
assert("invoices table has 1 row", allInvoices().join(","), `EXP/1/${fyLabel}`);
assert("sequence last_number = 1", seqState(fyStart), 1);

// Step 3: Peek again — should show EXP/2 (next after 1), no write
console.log("\n3. Peek after first invoice created");
const p4 = peekNextInvoiceNumber(TODAY);
assert("peek returns EXP/2/2026-27", p4, `EXP/2/${fyLabel}`);
assert("sequence still last_number = 1", seqState(fyStart), 1);

// Step 4: Create second invoice
console.log("\n4. Create second invoice (EXP/2)");
const num2 = createInvoice(TODAY);
assert("allocated number is EXP/2/2026-27", num2, `EXP/2/${fyLabel}`);
assert("invoices table has 2 rows", allInvoices().join(","), `EXP/1/${fyLabel},EXP/2/${fyLabel}`);
assert("sequence last_number = 2", seqState(fyStart), 2);

// Step 5: Delete first invoice — sequence should recalculate to MAX remaining (2)
console.log("\n5. Delete first invoice (EXP/1)");
deleteInvoice(num1);
assert("invoices table has 1 row", allInvoices().join(","), `EXP/2/${fyLabel}`);
assert("sequence recalculated to 2 (max remaining)", seqState(fyStart), 2);

// Step 6: Delete last invoice — sequence must reset to 0
console.log("\n6. Delete last invoice (EXP/2) — all invoices gone");
deleteInvoice(num2);
assert("invoices table is empty", allInvoices().join(","), "");
assert("sequence reset to 0", seqState(fyStart), 0);

// Step 7: Peek after full delete — must show EXP/1 again
console.log("\n7. Peek after all deleted");
const p5 = peekNextInvoiceNumber(TODAY);
assert("peek returns EXP/1/2026-27 (reset)", p5, `EXP/1/${fyLabel}`);

// Step 8: Create invoice after reset — must get EXP/1
console.log("\n8. Create invoice after full delete (EXP/1 again)");
const num3 = createInvoice(TODAY);
assert("allocated number is EXP/1/2026-27", num3, `EXP/1/${fyLabel}`);
assert("invoices table has 1 row", allInvoices().join(","), `EXP/1/${fyLabel}`);
assert("sequence last_number = 1", seqState(fyStart), 1);

// Step 9: Partial delete scenario — delete middle, confirm sequence preserves max
console.log("\n9. Create two more, delete middle — sequence tracks remaining max");
const num4 = createInvoice(TODAY);
const num5 = createInvoice(TODAY);
assert("EXP/2 created", num4, `EXP/2/${fyLabel}`);
assert("EXP/3 created", num5, `EXP/3/${fyLabel}`);
deleteInvoice(num4); // delete EXP/2, EXP/1 and EXP/3 remain
assert("sequence = 3 (max of remaining EXP/1, EXP/3)", seqState(fyStart), 3);
const p6 = peekNextInvoiceNumber(TODAY);
assert("peek after gap delete = EXP/4", p6, `EXP/4/${fyLabel}`);

// ─── Result ───────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(pass ? "ALL TESTS PASSED" : "SOME TESTS FAILED");
console.log("─".repeat(50));

db.close();
process.exit(pass ? 0 : 1);
