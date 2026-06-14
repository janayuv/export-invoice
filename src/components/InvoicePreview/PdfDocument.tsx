import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import type { Invoice, CompanySettings } from "@/lib/types";
import {
  amountInWords,
  fmtAmount,
  formatInvoiceDisplayDate,
  invoiceReferenceRows,
  rateColumnLabel,
} from "@/lib/invoiceDocument";

// ── Design tokens ────────────────────────────────────────────────────────────
const NAVY      = "#0f2d52";
const NAVY_LITE = "#eff6ff";
const GRAY_BG   = "#f8fafc";
const BD0       = "#000000";       // section borders
const BD1       = "#4b5563";       // mid borders
const BD2       = "#d1d5db";       // cell separators

const s = StyleSheet.create({
  page:  { padding: 14, fontSize: 7.5, fontFamily: "Helvetica" },
  // flex:1 → outer fills the full A4 content height (Page is direct parent).
  // The GOODS section then flex-grows to absorb all leftover vertical space,
  // so the declaration footer is always pinned to the page bottom — single page.
  outer: { border: "1.5pt solid #000", flexDirection: "column", flexGrow: 1 },
  bold:  { fontFamily: "Helvetica-Bold" },
  row:   { flexDirection: "row" },
  lbl:   { fontSize: 6.5, color: "#6b7280" },

  // thick section dividers
  sbB:  { borderBottom: `1pt solid ${BD0}` },
  // thinner mid-section dividers
  mbB:  { borderBottom: `0.75pt solid ${BD1}` },
  mbR:  { borderRight:  `1pt solid ${BD0}` },
  // cell separators inside tables
  cbB:  { borderBottom: `0.5pt solid ${BD2}` },
  cbR:  { borderRight:  `0.5pt solid ${BD2}` },

  navyBar: {
    backgroundColor: NAVY,
    paddingVertical: 2.5,
    paddingHorizontal: 4,
    borderBottom: `0.75pt solid ${BD1}`,
  },
  navyTxt: {
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
    fontSize: 7.5,
    letterSpacing: 0.6,
  },
  thBg: { backgroundColor: GRAY_BG },
});


interface Props {
  invoice: Invoice;
  company: CompanySettings;
}

export function InvoicePdfDocument({ invoice, company }: Props) {
  const items       = invoice.items        ?? [];
  const packingList = invoice.packing_list ?? [];
  const totalQty    = items.reduce((s, i) => s + i.quantity,     0);
  const totalAmt    = items.reduce((s, i) => s + i.total_amount, 0);
  const refs        = invoiceReferenceRows(invoice, company);
  const rateLabel   = rateColumnLabel(invoice.incoterm, invoice.currency);
  const showSa      = invoice.show_sa_number ?? true;

  // ── Column widths (must sum to 100% in both SA/non-SA modes) ──
  //   with SA:    5+10+13+38+10+12+12 = 100   totalLbl = 66
  //   without SA:  5+15+42+10+14+14  = 100   totalLbl = 62
  const srW       = "5%";
  const saW       = "10%";
  const partW     = showSa ? "13%" : "15%";
  const descW     = showSa ? "38%" : "42%";
  const qtyW      = "10%";
  const rateW     = showSa ? "12%" : "14%";
  const amtW      = showSa ? "12%" : "14%";
  const totalLblW = showSa ? "66%" : "62%";

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.outer}>

          {/* ═══ 1. HEADER ════════════════════════════════════════════════════ */}
          <View style={[s.row, s.sbB, { alignItems: "stretch", minHeight: 40 }]}>
            {/* Logo */}
            <View style={{
              width: 82, padding: 3,
              alignItems: "center", justifyContent: "center",
              backgroundColor: "#f0fdf4", borderRight: `1pt solid ${BD0}`,
            }}>
              {company.company_logo_base64 ? (
                <Image src={company.company_logo_base64}
                  style={{ width: 68, height: 30, objectFit: "contain" }} />
              ) : null}
            </View>
            {/* Title */}
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 8 }}>
              <Text style={[s.bold, { fontSize: 13, letterSpacing: 0.8, color: NAVY }]}>
                INVOICE CUM PACKING LIST
              </Text>
            </View>
            {/* Transport mode badge */}
            <View style={{
              width: 68, borderLeft: `1pt solid ${BD0}`,
              alignItems: "center", justifyContent: "center",
              padding: 3, backgroundColor: NAVY,
            }}>
              <Text style={[s.bold, { fontSize: 8.5, color: "#ffffff" }]}>
                {invoice.transport_mode}
              </Text>
            </View>
          </View>

          {/* ═══ 2. EXPORTER  |  INVOICE REFERENCES ═════════════════════════ */}
          <View style={[s.row, s.sbB]}>
            {/* Exporter */}
            <View style={[s.mbR, { width: "50%", padding: 4 }]}>
              <Text style={s.lbl}>EXPORTER</Text>
              <Text style={[s.bold, { marginTop: 1.5, fontSize: 8 }]}>{company.name}</Text>
              <Text style={{ marginTop: 2 }}>{company.address}</Text>
              <View style={{ flexDirection: "row", marginTop: 3 }}>
                {company.gstin ? (
                  <Text style={{ fontSize: 6.5, marginRight: 8 }}>GSTIN: {company.gstin}</Text>
                ) : null}
                {company.iec ? (
                  <Text style={{ fontSize: 6.5, marginRight: 8 }}>IEC: {company.iec}</Text>
                ) : null}
                {company.pan ? (
                  <Text style={{ fontSize: 6.5 }}>PAN: {company.pan}</Text>
                ) : null}
              </View>
            </View>
            {/* Invoice no + refs */}
            <View style={{ width: "50%", flexDirection: "column" }}>
              <View style={[s.mbB, { padding: 4, backgroundColor: NAVY_LITE }]}>
                <Text style={s.lbl}>INVOICE NO &amp; DATE</Text>
                <Text style={[s.bold, { fontSize: 9.5, marginTop: 2, color: NAVY }]}>
                  {refs[0].value}
                </Text>
              </View>
              <View style={{ padding: 4 }}>
                {refs.slice(1).map((r) => (
                  <RefRow key={r.label} label={r.label} value={r.value} />
                ))}
              </View>
            </View>
          </View>

          {/* ═══ 3. CONSIGNEE + SHIPPING  |  BUYER + TERMS ══════════════════ */}
          <View style={[s.row, s.sbB]}>
            {/* Left: Consignee + 4 ship rows */}
            <View style={[s.mbR, { width: "50%" }]}>
              <View style={[s.mbB, { padding: 3 }]}>
                <Text style={s.lbl}>CONSIGNEE</Text>
                <Text style={[s.bold, { marginTop: 1.5, fontSize: 7.5 }]}>
                  {invoice.consignee_name}
                </Text>
                <Text style={{ marginTop: 1.5 }}>{invoice.consignee_address}</Text>
              </View>
              <ShipRow left="Pre-Carriage By"     lv={invoice.pre_carriage_by}
                       right="Place of Receipt By" rv={invoice.place_of_receipt}  borderB />
              <ShipRow left="Vessel / Flight No."  lv={invoice.vessel}
                       right="Port of Loading"      rv={invoice.port_of_loading}   borderB />
              <ShipRow left="Port of Discharge"    lv={invoice.port_of_discharge}
                       right="Final Destination"    rv={invoice.final_destination} />
            </View>
            {/* Right: Buyer + Country + Payment + Incoterm */}
            <View style={{ width: "50%", flexDirection: "column" }}>
              <View style={[s.mbB, { padding: 3, minHeight: 28 }]}>
                <Text style={s.lbl}>BUYER (IF OTHER THAN CONSIGNEE)</Text>
                <Text style={{ marginTop: 1.5 }}>{invoice.buyer_if_other}</Text>
              </View>
              <View style={[s.mbB, { padding: 3 }]}>
                <Text style={s.lbl}>COUNTRY OF ORIGIN OF GOODS</Text>
                <Text style={[s.bold, { marginTop: 1.5 }]}>{invoice.country_of_origin}</Text>
              </View>
              <View style={[s.mbB, { padding: 3 }]}>
                <Text style={s.lbl}>TERMS OF PAYMENT</Text>
                <Text style={{ marginTop: 1.5 }}>{invoice.terms_of_payment}</Text>
              </View>
              <View style={{ padding: 3 }}>
                <Text style={s.lbl}>INCOTERM</Text>
                <Text style={[s.bold, { marginTop: 1.5 }]}>{invoice.incoterm}</Text>
              </View>
            </View>
          </View>

          {/* ═══ 4. GOODS TABLE (flex-grows to fill page) ════════════════════ */}
          <View style={[s.sbB, { flexGrow: 1, flexDirection: "column" }]}>
            {/* Section banner */}
            <View style={s.navyBar}><Text style={s.navyTxt}>GOODS</Text></View>

            {/* Column headers */}
            <View style={[s.row, s.thBg, s.mbB]}>
              <TH w={srW} center>Sr.</TH>
              {showSa && <TH w={saW}>SA Number</TH>}
              <TH w={partW}>Part Number</TH>
              <TH w={descW}>Description of Goods</TH>
              <TH w={qtyW} right>Qty</TH>
              <TH w={rateW} right>Rate</TH>
              <TH w={amtW} right last>Amount</TH>
            </View>

            {/* Unit / rate-label sub-header */}
            <View style={[s.row, s.thBg, s.mbB]}>
              <TH w={srW}></TH>
              {showSa && <TH w={saW}></TH>}
              <TH w={partW}></TH>
              <TH w={descW}></TH>
              <TH w={qtyW}  right sub>NOS</TH>
              <TH w={rateW} right sub>{rateLabel}</TH>
              <TH w={amtW}  right sub last>{rateLabel}</TH>
            </View>

            {/* Actual item rows */}
            {items.map((item, idx) => (
              <View key={`g-${idx}`} style={[s.row, s.cbB, { minHeight: 13 }]}>
                <TD w={srW}  center>{String(item.sr_no)}</TD>
                {showSa && <TD w={saW}>{item.sa_number}</TD>}
                <TD w={partW}>{item.part_number}</TD>
                <TD w={descW}>{item.description}</TD>
                <TD w={qtyW}  right>{fmtAmount(item.quantity, 0)}</TD>
                <TD w={rateW} right>{fmtAmount(item.unit_price, 3)}</TD>
                <TD w={amtW}  right last>{fmtAmount(item.total_amount)}</TD>
              </View>
            ))}

            {/* Flexible spacer — grows to absorb all leftover height so the
                table body always reaches the TOTAL row. Column separator lines
                continue down the empty space for a clean ledger look. */}
            <View style={[s.row, { flexGrow: 1 }]}>
              <View style={{ width: srW, borderRight: `0.5pt solid ${BD2}` }} />
              {showSa && <View style={{ width: saW, borderRight: `0.5pt solid ${BD2}` }} />}
              <View style={{ width: partW, borderRight: `0.5pt solid ${BD2}` }} />
              <View style={{ width: descW, borderRight: `0.5pt solid ${BD2}` }} />
              <View style={{ width: qtyW,  borderRight: `0.5pt solid ${BD2}` }} />
              <View style={{ width: rateW, borderRight: `0.5pt solid ${BD2}` }} />
              <View style={{ width: amtW }} />
            </View>

            {/* TOTAL row */}
            <View style={[s.row, { borderTop: `1pt solid ${BD0}`, minHeight: 16 }]}>
              <View style={{ width: totalLblW, padding: 3, alignItems: "flex-end", borderRight: `0.5pt solid ${BD2}` }}>
                <Text style={[s.bold, { fontSize: 8 }]}>TOTAL</Text>
              </View>
              <View style={{ width: qtyW, padding: 3, alignItems: "flex-end", borderRight: `0.5pt solid ${BD2}` }}>
                <Text style={s.bold}>{fmtAmount(totalQty, 0)}</Text>
              </View>
              <View style={{ width: rateW, borderRight: `0.5pt solid ${BD2}` }} />
              <View style={{ width: amtW, padding: 3, alignItems: "flex-end", backgroundColor: NAVY }}>
                <Text style={[s.bold, { fontSize: 9, color: "#ffffff" }]}>{fmtAmount(totalAmt)}</Text>
              </View>
            </View>
          </View>

          {/* ═══ 5. AMOUNT IN WORDS ══════════════════════════════════════════ */}
          <View style={[s.sbB, { padding: 3 }]}>
            <Text style={{ fontSize: 7 }}>
              <Text style={[s.bold, { color: NAVY }]}>(IN WORDS){"   "}</Text>
              {amountInWords(totalAmt, invoice.currency)}
            </Text>
          </View>

          {/* ═══ 6. PACKING LIST ═════════════════════════════════════════════ */}
          <View style={s.sbB}>
            <View style={s.navyBar}><Text style={s.navyTxt}>PACKING LIST</Text></View>
            <View style={[s.row, s.thBg, s.mbB]}>
              <TH w="5%"  center>Sr.</TH>
              <TH w="33%">Marks &amp; Nos</TH>
              <TH w="13%">No of Pkgs</TH>
              <TH w="37%">Dimensions</TH>
              <TH w="12%" last>Unit</TH>
            </View>
            {packingList.map((row, idx) => (
              <View key={`p-${idx}`} style={[s.row, s.cbB, { minHeight: 13 }]}>
                <TD w="5%"  center>{String(idx + 1)}</TD>
                <TD w="33%">{row.marks_nos}</TD>
                <TD w="13%">{row.no_of_pkgs}</TD>
                <TD w="37%">{row.dimensions}</TD>
                <TD w="12%" last>{row.dimensions_unit}</TD>
              </View>
            ))}
          </View>

          {/* ═══ 7. WEIGHT ═══════════════════════════════════════════════════ */}
          <View style={[s.sbB, { padding: 3, flexDirection: "row" }]}>
            <Text style={{ marginRight: 24 }}>
              <Text style={s.bold}>Net Weight: </Text>{invoice.net_weight ?? ""} Kgs
            </Text>
            <Text>
              <Text style={s.bold}>Gross Weight: </Text>{invoice.gross_weight ?? ""} Kgs
            </Text>
          </View>

          {/* ═══ 8. NOTES (optional) ═════════════════════════════════════════ */}
          {invoice.notes ? (
            <View style={[s.sbB, { padding: 3 }]}>
              <Text style={{ fontSize: 7 }}>
                <Text style={s.bold}>NOTES: </Text>
                {invoice.notes}
              </Text>
            </View>
          ) : null}

          {/* ═══ 9. DECLARATION + SIGNATURE ══════════════════════════════════ */}
          <View style={[s.row, { padding: 5, minHeight: 58 }]}>
            {/* Declaration text */}
            <View style={{ width: "60%", paddingRight: 8 }}>
              <Text style={{ fontSize: 7, color: "#374151" }}>
                We declare that this invoice shows the actual price of the goods
                described and that all particulars are true and correct.
              </Text>
              {company.lut_arn_no ? (
                <Text style={{ fontSize: 7, marginTop: 3, color: "#374151" }}>
                  Export under LUT ARN: {company.lut_arn_no}
                  {company.lut_arn_date
                    ? ` dated ${formatInvoiceDisplayDate(company.lut_arn_date)}`
                    : ""}
                </Text>
              ) : null}
              <View style={{ marginTop: 6 }}>
                <Text style={{ fontSize: 7 }}>Place : {company.place}</Text>
                <Text style={{ fontSize: 7, marginTop: 1 }}>
                  Date : {formatInvoiceDisplayDate(invoice.invoice_date)}
                </Text>
              </View>
            </View>
            {/* Signatory */}
            <View style={{ width: "40%", alignItems: "flex-end" }}>
              <Text style={[s.bold, { color: NAVY, fontSize: 8 }]}>For {company.name}</Text>
              <View style={{
                marginTop: 22,
                borderTop: `0.75pt solid ${BD1}`,
                paddingTop: 2,
                minWidth: 130,
                alignItems: "center",
              }}>
                <Text style={{ fontSize: 7 }}>Authorised Signatory</Text>
                {company.signatory_name ? (
                  <Text style={{ fontSize: 6.5, color: "#374151", marginTop: 1 }}>
                    ({company.signatory_name})
                  </Text>
                ) : null}
              </View>
            </View>
          </View>

        </View>
      </Page>
    </Document>
  );
}

// ── Helper components ────────────────────────────────────────────────────────

function RefRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", marginBottom: 2 }}>
      <Text style={{ fontSize: 6.5, color: "#6b7280", width: 100 }}>{label}</Text>
      <Text style={{ fontFamily: "Helvetica-Bold", flex: 1, fontSize: 7.5 }}>{value}</Text>
    </View>
  );
}

function ShipRow({
  left, lv, right, rv, borderB,
}: {
  left: string; lv: string; right: string; rv: string; borderB?: boolean;
}) {
  return (
    <View style={[
      { flexDirection: "row" },
      borderB ? { borderBottom: "0.75pt solid #4b5563" } : {},
    ]}>
      <View style={{ width: "50%", borderRight: "0.75pt solid #4b5563", padding: 2.5 }}>
        <Text style={{ fontSize: 6.5, color: "#6b7280" }}>{left}</Text>
        <Text style={{ fontSize: 7.5, marginTop: 1 }}>{lv}</Text>
      </View>
      <View style={{ width: "50%", padding: 2.5 }}>
        <Text style={{ fontSize: 6.5, color: "#6b7280" }}>{right}</Text>
        <Text style={{ fontSize: 7.5, marginTop: 1 }}>{rv}</Text>
      </View>
    </View>
  );
}

function TH({
  children, w, right, center, sub, last,
}: {
  children?: React.ReactNode; w: string;
  right?: boolean; center?: boolean; sub?: boolean; last?: boolean;
}) {
  return (
    <View style={[
      { width: w, padding: 2.5, borderRight: last ? undefined : "0.5pt solid #d1d5db" },
      right  ? { alignItems: "flex-end" }   : {},
      center ? { alignItems: "center" }     : {},
    ]}>
      {typeof children === "string" ? (
        <Text style={sub
          ? { fontSize: 6.5, color: "#6b7280", fontFamily: "Helvetica-Oblique" }
          : { fontSize: 7, fontFamily: "Helvetica-Bold" }
        }>{children}</Text>
      ) : children}
    </View>
  );
}

function TD({
  children, w, right, center, bold, last,
}: {
  children?: React.ReactNode; w: string;
  right?: boolean; center?: boolean; bold?: boolean; last?: boolean;
}) {
  return (
    <View style={[
      { width: w, padding: 2.5, borderRight: last ? undefined : "0.5pt solid #d1d5db" },
      right  ? { alignItems: "flex-end" } : {},
      center ? { alignItems: "center" }   : {},
    ]}>
      {typeof children === "string" ? (
        <Text style={bold ? { fontFamily: "Helvetica-Bold" } : undefined}>{children}</Text>
      ) : children}
    </View>
  );
}
