import ExcelJS from "exceljs";
import type { Invoice, CompanySettings } from "@/lib/types";
import {
  amountInWords,
  formatInvoiceDisplayDate,
  invoiceReferenceRows,
  rateColumnLabel,
} from "@/lib/invoiceDocument";

// ─── Palette (all ARGB with FF alpha prefix) ──────────────────────────────────
const P = {
  navy:     "FF1E3F6F",   // dark navy — primary header bars
  blue:     "FF2563EB",   // medium blue — section sub-headers, table col headers
  packHead: "FF334155",   // slate — packing/goods section banners
  altRow:   "FFF0F7FF",   // very light blue — alternating item rows
  totalBg:  "FFFFF9E6",   // pale amber — total row
  sectionBg:"FFEBF4FF",   // light blue — in-words row, weight row
  signBg:   "FFF1F5F9",   // off-white — signature area
  divider:  "FFD1E0F7",   // light blue-grey — hair borders inside panels
  border:   "FFB0C4DE",   // steel blue — thin borders
  borderDk: "FF1E3F6F",   // navy — medium/box borders
  white:    "FFFFFFFF",
  black:    "FF111827",
  muted:    "FF64748B",   // slate-grey — secondary text
} as const;

// ─── Border factories ─────────────────────────────────────────────────────────
type Bs = Partial<ExcelJS.Borders>;

const thin   = (c = P.border  ): ExcelJS.Border => ({ style: "thin",   color: { argb: c } });
const medium = (c = P.borderDk): ExcelJS.Border => ({ style: "medium", color: { argb: c } });
const hair   = (c = P.divider ): ExcelJS.Border => ({ style: "hair",   color: { argb: c } });

// New border-object factories (called each use to avoid shared mutation)
const bAll  = (): Bs => ({ top: thin(),   left: thin(),   bottom: thin(),   right: thin()   });
const bBox  = (): Bs => ({ top: medium(), left: medium(), bottom: medium(), right: medium() });
const bHair = (): Bs => ({ top: hair(),   left: hair(),   bottom: hair(),   right: hair()   });

// ─── Column indices (A=1 … I=9) ──────────────────────────────────────────────
// Two-panel header sections  : left panel = A:F (cols 1-6),
//                               ref label = G (col 7),  ref value = H:I (cols 8-9)
// Goods / packing item rows  : A=Sr  B=SA(optional)  C=PartNo  D=Desc
//                               E=Qty  F=Unit  G=Rate  H=Amount  I=Amount(merged with H)
const COL = {
  SR:   1,   // A  width 5
  SA:   2,   // B  width 10  hidden when !show_sa_number
  PART: 3,   // C  width 13/16 (narrows when SA shown)
  DESC: 4,   // D  width 24/28
  QTY:  5,   // E  width 8
  UNIT: 6,   // F  width 6
  RATE: 7,   // G  width 14   — also: ref-label col in header sections
  AMT:  8,   // H  width 14   — also: ref-value start in header sections
  AUX:  9,   // I  width 10   — merged with H for ref values; part of Amount col
} as const;

const LAST     = COL.AUX;   // 9 — rightmost column
const LEFT_END = COL.UNIT;  // 6 — left panel ends at F in 2-panel rows
const RL       = COL.RATE;  // 7 — ref-label column in header sections
const RV_S     = COL.AMT;   // 8 — ref-value start
const RV_E     = COL.AUX;   // 9 — ref-value end

// ─── Style helpers ─────────────────────────────────────────────────────────────
interface So {
  bold?:   boolean;
  italic?: boolean;
  size?:   number;
  fg?:     string;    // ARGB text colour
  bg?:     string;    // ARGB fill
  h?:      "left" | "center" | "right";
  v?:      "top"  | "middle" | "bottom";
  wrap?:   boolean;
  border?: Bs;
  num?:    string;
  indent?: number;
}

function applyStyle(cell: ExcelJS.Cell, o: So) {
  cell.font = {
    name:   "Calibri",
    size:   o.size   ?? 9,
    bold:   o.bold   ?? false,
    italic: o.italic ?? false,
    color:  { argb: o.fg ?? P.black },
  };
  cell.alignment = {
    horizontal: o.h    ?? "left",
    vertical:   o.v    ?? "middle",
    wrapText:   o.wrap ?? false,
    indent:     o.indent ?? 0,
  };
  if (o.bg)     cell.fill   = { type: "pattern", pattern: "solid", fgColor: { argb: o.bg } };
  if (o.border) cell.border = o.border as ExcelJS.Borders;
  if (o.num)    cell.numFmt = o.num;
}

function gc(ws: ExcelJS.Worksheet, r: number, col: number): ExcelJS.Cell {
  return ws.getRow(r).getCell(col);
}

// Set single cell value + style
function sc(ws: ExcelJS.Worksheet, r: number, col: number, val: ExcelJS.CellValue, o: So = {}) {
  const cell = gc(ws, r, col);
  cell.value = val;
  applyStyle(cell, o);
}

// Merge range, set top-left value + style
function mc(
  ws: ExcelJS.Worksheet,
  r1: number, c1: number,
  r2: number, c2: number,
  val: ExcelJS.CellValue = null,
  o: So = {},
) {
  if (r1 !== r2 || c1 !== c2) ws.mergeCells(r1, c1, r2, c2);
  const cell = ws.getRow(r1).getCell(c1);
  cell.value = val;
  applyStyle(cell, o);
}

function rh(ws: ExcelJS.Worksheet, r: number, h: number) {
  ws.getRow(r).height = h;
}

// ─── Section: Company banner + title ─────────────────────────────────────────
function secHeader(
  ws: ExcelJS.Worksheet, r: number,
  invoice: Invoice, company: CompanySettings,
): number {
  // Two logo-height rows: company name (left A:F) | "INVOICE CUM PACKING LIST" (right G:I)
  rh(ws, r, 36); rh(ws, r + 1, 36);
  mc(ws, r, 1, r + 1, LEFT_END, company.name || "", {
    bold: true, size: 14, fg: P.white, bg: P.navy,
    h: "left", v: "middle", border: bBox(), indent: 2,
  });
  mc(ws, r, RL, r + 1, LAST, "INVOICE CUM PACKING LIST", {
    bold: true, size: 11, fg: P.white, bg: P.navy,
    h: "center", v: "middle", border: bBox(),
  });
  r += 2;

  // Address row (left) | transport mode (right)
  rh(ws, r, 16);
  mc(ws, r, 1, r, LEFT_END, company.address || "", {
    size: 8, fg: P.muted, h: "left", v: "middle", indent: 2,
    border: { left: medium(), right: thin(), bottom: hair() },
  });
  mc(ws, r, RL, r, LAST, `TRANSPORT MODE: ${invoice.transport_mode || ""}`, {
    bold: true, size: 8.5, fg: P.white, bg: P.blue,
    h: "center", v: "middle", border: bBox(),
  });
  r += 1;
  return r;
}

// ─── Section: Exporter (left A:F) + Invoice refs (right G:I) ─────────────────
function secExporterRefs(
  ws: ExcelJS.Worksheet, r: number,
  invoice: Invoice, company: CompanySettings,
): number {
  const refs = invoiceReferenceRows(invoice, company);
  const exporterLines = [
    company.name || "",
    ...(company.address || "").split("\n"),
    company.gstin ? `GSTIN NO: ${company.gstin}` : "",
    company.iec   ? `IEC: ${company.iec}`         : "",
    company.pan   ? `PAN: ${company.pan}`         : "",
  ].filter(Boolean);

  const nRows = Math.max(exporterLines.length, refs.length, 4);

  // Section header bar
  rh(ws, r, 22);
  mc(ws, r, 1, r, LEFT_END, "EXPORTER", {
    bold: true, size: 8, fg: P.white, bg: P.navy,
    h: "left", v: "middle", border: bBox(), indent: 1,
  });
  mc(ws, r, RL, r, LAST, "INVOICE REFERENCE", {
    bold: true, size: 8, fg: P.white, bg: P.navy,
    h: "left", v: "middle", border: bBox(), indent: 1,
  });
  r += 1;

  for (let i = 0; i < nRows; i++) {
    rh(ws, r, 22);
    const isLast  = i === nRows - 1;
    const bBottom = isLast ? medium() : hair();
    const ref     = refs[i];

    // Left panel: A:F merged
    mc(ws, r, 1, r, LEFT_END, exporterLines[i] ?? null, {
      size: 9, bold: i === 0,
      fg: i === 0 ? P.black : P.muted,
      h: "left", v: "middle", indent: i === 0 ? 1 : 2,
      border: { left: medium(), right: thin(), bottom: bBottom },
    });

    // Ref label: G
    sc(ws, r, RL, ref?.label ?? null, {
      size: 8, bold: true, fg: P.muted,
      h: "left", v: "middle", indent: 1,
      border: { left: thin(), bottom: bBottom },
    });

    // Ref value: H:I merged per row
    ws.mergeCells(r, RV_S, r, RV_E);
    gc(ws, r, RV_S).value = ref?.value ?? null;
    applyStyle(gc(ws, r, RV_S), {
      size: 9, bold: i === 0,
      fg: i === 0 ? P.black : P.muted,
      h: "left", v: "middle", indent: 1,
      border: { left: hair(), right: medium(), bottom: bBottom },
    });
    r += 1;
  }
  return r;
}

// ─── Section: Consignee (left A:F) + Buyer if other (right G:I) ──────────────
function secConsigneeBuyer(ws: ExcelJS.Worksheet, r: number, invoice: Invoice): number {
  const cl = [
    invoice.consignee_name,
    ...(invoice.consignee_address || "").split("\n"),
  ].filter(Boolean);
  const bl = invoice.buyer_if_other
    ? invoice.buyer_if_other.split("\n").filter(Boolean)
    : [];
  const nRows = Math.max(cl.length, bl.length, 3);

  rh(ws, r, 22);
  mc(ws, r, 1, r, LEFT_END, "CONSIGNEE", {
    bold: true, size: 8, fg: P.white, bg: P.blue,
    h: "left", v: "middle", border: bBox(), indent: 1,
  });
  mc(ws, r, RL, r, LAST,
    invoice.buyer_if_other ? "BUYER (IF OTHER THAN CONSIGNEE)" : "",
    { bold: true, size: 8, fg: P.white, bg: P.blue,
      h: "left", v: "middle", border: bBox(), indent: 1 },
  );
  r += 1;

  for (let i = 0; i < nRows; i++) {
    rh(ws, r, 22);
    const isLast  = i === nRows - 1;
    const bBottom = isLast ? medium() : hair();
    mc(ws, r, 1, r, LEFT_END, cl[i] ?? null, {
      size: 9, h: "left", v: "middle", indent: 2,
      border: { left: medium(), right: thin(), bottom: bBottom },
    });
    mc(ws, r, RL, r, LAST, bl[i] ?? null, {
      size: 9, h: "left", v: "middle", indent: 1,
      border: { left: thin(), right: medium(), bottom: bBottom },
    });
    r += 1;
  }
  return r;
}

// ─── Section: Shipment details (3 rows × 3 label+value groups) ───────────────
function secShipment(ws: ExcelJS.Worksheet, r: number, invoice: Invoice): number {
  const rows: [string, string, string, string, string, string][] = [
    ["PRE-CARRIAGE BY",   invoice.pre_carriage_by       || "",
     "PLACE OF RECEIPT",  invoice.place_of_receipt      || "",
     "COUNTRY OF ORIGIN", invoice.country_of_origin     || ""],
    ["VESSEL / FLIGHT",   invoice.vessel                || "",
     "PORT OF LOADING",   invoice.port_of_loading       || "",
     "TERMS OF PAYMENT",  invoice.terms_of_payment      || ""],
    ["PORT OF DISCHARGE", invoice.port_of_discharge     || "",
     "FINAL DESTINATION", invoice.final_destination     || "",
     "COUNTRY OF DEST.",  invoice.country_of_destination || ""],
  ];

  // 9 cols split evenly into 3 groups: A:C (1-3), D:F (4-6), G:I (7-9)
  const groups: [number, number][] = [[1, 3], [4, 6], [7, LAST]];

  for (const [ri, row] of rows.entries()) {
    rh(ws, r, 30);
    const isLast  = ri === rows.length - 1;
    const bBottom = isLast ? medium() : thin();
    const pairs: [string, string][] = [
      [row[0], row[1]], [row[2], row[3]], [row[4], row[5]],
    ];
    for (const [gi, [label, value]] of pairs.entries()) {
      const [c1, c2] = groups[gi];
      const bLeft  = gi === 0 ? medium() : thin();
      const bRight = gi === 2 ? medium() : thin();
      // Label in first col of group
      sc(ws, r, c1, label, {
        size: 7, bold: true, fg: P.muted, h: "left", v: "middle", indent: 1,
        border: { top: thin(), left: bLeft, bottom: bBottom },
      });
      // Value spans remaining cols of group
      mc(ws, r, c1 + 1, r, c2, value, {
        size: 9, h: "left", v: "middle",
        border: { top: thin(), right: bRight, bottom: bBottom },
      });
    }
    r += 1;
  }
  return r;
}

// ─── Section: Goods table ─────────────────────────────────────────────────────
function secGoods(
  ws: ExcelJS.Worksheet, r: number,
  invoice: Invoice, showSa: boolean,
): number {
  const items  = invoice.items ?? [];
  const rLabel = rateColumnLabel(invoice.incoterm, invoice.currency);
  const totalQ = items.reduce((s, i) => s + i.quantity,    0);
  const totalA = items.reduce((s, i) => s + i.total_amount, 0);

  // Banner
  rh(ws, r, 18);
  mc(ws, r, 1, r, LAST, "DESCRIPTION OF GOODS", {
    bold: true, size: 8, fg: P.white, bg: P.packHead,
    h: "left", v: "middle", border: bBox(), indent: 1,
  });
  r += 1;

  // Column headers — two layouts depending on SA visibility
  rh(ws, r, 42);
  type ColSpec = [number, number, string, "center" | "right" | "left"];
  const hdrs: ColSpec[] = showSa
    ? [
        [COL.SR,   COL.SR,   "SR.",                         "center"],
        [COL.SA,   COL.SA,   "SA NUMBER",                   "center"],
        [COL.PART, COL.PART, "PART NUMBER",                 "left"],
        [COL.DESC, COL.DESC, "DESCRIPTION",                 "left"],
        [COL.QTY,  COL.QTY,  "QTY",                        "center"],
        [COL.UNIT, COL.UNIT, "UNIT",                        "center"],
        [COL.RATE, COL.RATE, rLabel,                        "right"],
        [COL.AMT,  COL.AUX,  `AMOUNT (${invoice.currency})`, "right"],
      ]
    : [
        [COL.SR,   COL.SR,   "SR.",                         "center"],
        [COL.PART, COL.PART, "PART NUMBER",                 "left"],
        [COL.DESC, COL.DESC, "DESCRIPTION",                 "left"],
        [COL.QTY,  COL.QTY,  "QTY",                        "center"],
        [COL.UNIT, COL.UNIT, "UNIT",                        "center"],
        [COL.RATE, COL.RATE, rLabel,                        "right"],
        [COL.AMT,  COL.AUX,  `AMOUNT (${invoice.currency})`, "right"],
      ];
  for (const [c1, c2, label, align] of hdrs) {
    mc(ws, r, c1, r, c2, label, {
      bold: true, size: 8.5, fg: P.white, bg: P.blue,
      h: align, v: "middle", border: bAll(), wrap: true,
    });
  }
  r += 1;

  // Item rows
  for (const [idx, item] of items.entries()) {
    rh(ws, r, 22);
    const bg = idx % 2 === 1 ? P.altRow : undefined;
    const rs: So = { size: 9, v: "middle", border: bHair(), ...(bg ? { bg } : {}) };

    sc(ws, r, COL.SR,   item.sr_no,             { ...rs, h: "center" });
    if (showSa) {
      sc(ws, r, COL.SA, item.sa_number || "",   { ...rs, size: 8, fg: P.muted });
    }
    sc(ws, r, COL.PART, item.part_number || "", { ...rs, bold: true });
    sc(ws, r, COL.DESC, item.description || "", { ...rs, wrap: true });
    sc(ws, r, COL.QTY,  item.quantity,          { ...rs, h: "center", num: "#,##0.##" });
    sc(ws, r, COL.UNIT, item.unit || "",        { ...rs, h: "center" });
    sc(ws, r, COL.RATE, item.unit_price,        { ...rs, h: "right",  num: "#,##0.00" });
    mc(ws, r, COL.AMT, r, COL.AUX, item.total_amount, {
      ...rs, h: "right", bold: true, num: "#,##0.00",
    });
    r += 1;
  }

  // Total row
  rh(ws, r, 48);
  mc(ws, r, COL.SR, r, COL.DESC, "TOTAL", {
    bold: true, size: 10, bg: P.totalBg, h: "right", v: "middle", indent: 2,
    border: { top: medium(), left: medium(), bottom: medium(), right: thin() },
  });
  sc(ws, r, COL.QTY, totalQ, {
    bold: true, size: 10, bg: P.totalBg, h: "center", v: "middle", num: "#,##0.##",
    border: { top: medium(), bottom: medium() },
  });
  mc(ws, r, COL.UNIT, r, COL.RATE, "", {
    bg: P.totalBg, border: { top: medium(), bottom: medium() },
  });
  mc(ws, r, COL.AMT, r, COL.AUX, totalA, {
    bold: true, size: 10, bg: P.totalBg, h: "right", v: "middle", num: "#,##0.00",
    border: { top: medium(), left: thin(), bottom: medium(), right: medium() },
  });
  r += 1;

  // Amount in words
  rh(ws, r, 48);
  mc(ws, r, 1, r, LAST, `IN WORDS: ${amountInWords(totalA, invoice.currency)}`, {
    bold: true, size: 8.5, bg: P.sectionBg,
    h: "left", v: "middle", border: bBox(), indent: 1,
  });
  r += 1;

  return r;
}

// ─── Section: Packing list ────────────────────────────────────────────────────
function secPackingList(ws: ExcelJS.Worksheet, r: number, invoice: Invoice): number {
  const items   = invoice.items ?? [];
  const hasData = items.some(i => i.marks_nos || i.no_of_pkgs || i.dimensions);
  if (!hasData) return r;

  // Banner
  rh(ws, r, 18);
  mc(ws, r, 1, r, LAST, "PACKING LIST", {
    bold: true, size: 8, fg: P.white, bg: P.packHead,
    h: "left", v: "middle", border: bBox(), indent: 1,
  });
  r += 1;

  // Column headers: Sr | Marks & Nos (B:C) | No of Pkgs (D) | Dimensions (E:F) | Unit (G:I)
  rh(ws, r, 20);
  type PH = [number, number, string];
  const ph: PH[] = [
    [COL.SR,   COL.SR,   "SR."],
    [COL.SA,   COL.PART, "MARKS & NOS."],
    [COL.DESC, COL.DESC, "NO. OF PKGS"],
    [COL.QTY,  COL.UNIT, "DIMENSIONS"],
    [COL.RATE, COL.AUX,  "UNIT"],
  ];
  for (const [c1, c2, label] of ph) {
    mc(ws, r, c1, r, c2, label, {
      bold: true, size: 8.5, fg: P.white, bg: P.packHead,
      h: "center", v: "middle", border: bAll(),
    });
  }
  r += 1;

  // Item rows
  for (const [idx, item] of items.entries()) {
    rh(ws, r, 16);
    const bg = idx % 2 === 1 ? P.altRow : undefined;
    const rs: So = { size: 9, v: "middle", border: bHair(), ...(bg ? { bg } : {}) };
    sc(ws, r, COL.SR,   item.sr_no,              { ...rs, h: "center" });
    mc(ws, r, COL.SA,   r, COL.PART, item.marks_nos       || "", { ...rs });
    sc(ws, r, COL.DESC, item.no_of_pkgs          || "",    { ...rs, h: "center" });
    mc(ws, r, COL.QTY,  r, COL.UNIT, item.dimensions      || "", { ...rs, h: "center" });
    mc(ws, r, COL.RATE, r, COL.AUX,  item.dimensions_unit || "", { ...rs, h: "center" });
    r += 1;
  }

  // Weight summary row
  if (invoice.net_weight || invoice.gross_weight) {
    rh(ws, r, 16);
    const wt = [
      invoice.net_weight   ? `NET WEIGHT  : ${invoice.net_weight}`   : "",
      invoice.gross_weight ? `GROSS WEIGHT: ${invoice.gross_weight}` : "",
    ].filter(Boolean).join("     ");
    mc(ws, r, 1, r, LAST, wt, {
      bold: true, size: 8.5, bg: P.sectionBg,
      h: "left", v: "middle", border: bBox(), indent: 1,
    });
    r += 1;
  }

  return r;
}

// ─── Section: Declaration + authorised signature ──────────────────────────────
function secDeclaration(
  ws: ExcelJS.Worksheet, r: number,
  invoice: Invoice, company: CompanySettings,
): number {
  const lut = company.lut_arn_no
    ? `Export under LUT ARN: ${company.lut_arn_no}` +
      (company.lut_arn_date
        ? ` dated ${formatInvoiceDisplayDate(company.lut_arn_date)}`
        : "")
    : "";

  // Declaration banner
  rh(ws, r, 45);
  mc(ws, r, 1, r, LAST, "DECLARATION", {
    bold: true, size: 8, fg: P.white, bg: P.navy,
    h: "left", v: "middle", border: bBox(), indent: 1,
  });
  r += 1;

  // Declaration text
  rh(ws, r, 88);
  mc(ws, r, 1, r, LAST,
    "We declare that this invoice shows the actual price of the goods described " +
    "and that all particulars are true and correct.",
    { italic: true, size: 8, fg: P.muted, h: "left", v: "middle", wrap: true,
      border: bBox(), indent: 1 },
  );
  r += 1;

  // LUT ARN line
  if (lut) {
    rh(ws, r, 28);
    mc(ws, r, 1, r, LAST, lut, {
      bold: true, size: 8, h: "left", v: "middle", border: bBox(), indent: 1,
    });
    r += 1;
  }

  // Invoice notes
  if (invoice.notes) {
    rh(ws, r, 38);
    mc(ws, r, 1, r, LAST, `NOTES: ${invoice.notes}`, {
      size: 8.5, fg: P.muted, h: "left", v: "middle", wrap: true,
      border: bBox(), indent: 1,
    });
    r += 1;
  }

  // Place / Date (left half) | For Company (right half)
  const mid = Math.floor(LAST / 2);   // col 4 — splits A:D vs E:I
  rh(ws, r, 41);
  const placeDate = [
    company.place ? `Place : ${company.place}` : "",
    `Date  : ${formatInvoiceDisplayDate(invoice.invoice_date)}`,
  ].filter(Boolean).join("\n");
  mc(ws, r, 1, r, mid, placeDate, {
    size: 9, wrap: true, v: "middle", indent: 1,
    border: { top: thin(), left: medium(), bottom: thin(), right: thin() },
  });
  mc(ws, r, mid + 1, r, LAST, `For ${company.name || ""}`, {
    bold: true, size: 9.5, h: "center", v: "middle", bg: P.signBg,
    border: { top: thin(), left: thin(), bottom: thin(), right: medium() },
  });
  r += 1;

  // Blank signature space (40pt tall)
  rh(ws, r, 62);
  mc(ws, r, 1, r, mid, "", {
    border: { left: medium(), right: thin(), bottom: thin() },
  });
  mc(ws, r, mid + 1, r, LAST, "", {
    bg: P.signBg,
    border: { left: thin(), right: medium(), bottom: thin() },
  });
  r += 1;

  // Signatory label
  rh(ws, r, 43);
  mc(ws, r, 1, r, mid, "", {
    border: { left: medium(), right: thin(), bottom: medium() },
  });
  mc(ws, r, mid + 1, r, LAST,
    `Authorised Signatory${company.signatory_name ? `\n(${company.signatory_name})` : ""}`,
    { bold: true, size: 8.5, h: "center", v: "middle", wrap: true, bg: P.signBg,
      border: { left: thin(), right: medium(), bottom: medium() } },
  );
  r += 1;

  return r;
}

// ─── Workbook builder ─────────────────────────────────────────────────────────
// Pure: builds the .xlsx and returns its bytes. No Tauri/filesystem dependency so
// this module can be imported into a Web Worker (see lib/exportWorker.ts). The
// save dialog + writeFile orchestration lives in lib/exports.ts.
export async function buildInvoiceExcelBytes(
  invoice: Invoice,
  company: CompanySettings,
): Promise<Uint8Array> {
  const showSa = invoice.show_sa_number ?? false;

  const wb      = new ExcelJS.Workbook();
  wb.creator    = company.name || "Export Invoice";
  wb.created    = new Date();
  wb.modified   = new Date();

  const ws = wb.addWorksheet("Invoice", {
    pageSetup: {
      paperSize:   9,
      orientation: "portrait",
    },
    headerFooter: {
      oddFooter: `&C&"Calibri,Regular"&8${company.name} | ${invoice.invoice_number} | Page &P of &N`,
    },
    views: [{ state: "normal", zoomScale: 90 }],
  });

  // A4 page margins in inches
  ws.pageSetup.margins = {
    left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3,
  };
  ws.pageSetup.fitToPage   = true;
  ws.pageSetup.fitToWidth  = 1;
  ws.pageSetup.fitToHeight = 0;

  // Column widths; SA col hidden when show_sa_number is false
  ws.getColumn(COL.SR  ).width  = 6;
  ws.getColumn(COL.SA  ).width  = showSa ? 13 : 0.1;
  ws.getColumn(COL.SA  ).hidden = !showSa;
  ws.getColumn(COL.PART).width  = showSa ? 16 : 20;
  ws.getColumn(COL.DESC).width  = showSa ? 30 : 36;
  ws.getColumn(COL.QTY ).width  = 10;
  ws.getColumn(COL.UNIT).width  = 8;
  ws.getColumn(COL.RATE).width  = 18;
  ws.getColumn(COL.AMT ).width  = 18;
  ws.getColumn(COL.AUX ).width  = 12;

  // Build sections
  let r = 1;
  r = secHeader(ws, r, invoice, company);
  r = secExporterRefs(ws, r, invoice, company);
  r = secConsigneeBuyer(ws, r, invoice);
  r = secShipment(ws, r, invoice);

  rh(ws, r, 8); r += 1;   // spacer

  r = secGoods(ws, r, invoice, showSa);

  rh(ws, r, 8); r += 1;   // spacer

  r = secPackingList(ws, r, invoice);
  r = secDeclaration(ws, r, invoice, company);

  ws.pageSetup.printArea = `A1:I${r - 1}`;

  // writeBuffer() uses the browser-compatible JSZip path in ExcelJS's browser bundle
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}
