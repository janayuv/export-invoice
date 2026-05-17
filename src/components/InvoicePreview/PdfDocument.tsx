import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { Invoice, CompanySettings } from "@/lib/types";

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 8, fontFamily: "Helvetica" },
  bold: { fontFamily: "Helvetica-Bold" },
  border: { border: "1pt solid #444" },
  borderB: { borderBottom: "1pt solid #444" },
  borderR: { borderRight: "1pt solid #444" },
  borderT: { borderTop: "1pt solid #444" },
  row: { flexDirection: "row" },
  cell: { padding: 3 },
  gray: { color: "#666", fontSize: 7 },
  tableHead: { fontFamily: "Helvetica-Bold", backgroundColor: "#f5f5f5" },
  right: { textAlign: "right" },
  center: { textAlign: "center" },
});

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function amountInWords(amount: number, currency: string): string {
  const ones = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
    "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN",
    "EIGHTEEN", "NINETEEN"];
  const t = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];
  function w(n: number): string {
    if (n === 0) return "";
    if (n < 20) return ones[n] + " ";
    if (n < 100) return t[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "") + " ";
    if (n < 1000) return ones[Math.floor(n / 100)] + " HUNDRED " + w(n % 100);
    if (n < 100000) return w(Math.floor(n / 1000)) + "THOUSAND " + w(n % 1000);
    return w(Math.floor(n / 100000)) + "LAKH " + w(n % 100000);
  }
  const map: Record<string, { major: string; minor: string }> = {
    USD: { major: "US DOLLAR", minor: "CENTS" },
    EUR: { major: "EURO", minor: "CENTS" },
    GBP: { major: "POUND STERLING", minor: "PENCE" },
    AED: { major: "UAE DIRHAM", minor: "FILS" },
    INR: { major: "INDIAN RUPEE", minor: "PAISE" },
  };
  const names = map[currency] ?? { major: currency, minor: "CENTS" };
  const major = Math.floor(amount);
  const minor = Math.round((amount - major) * 100);
  let result = w(major).trim() + " " + names.major;
  if (minor > 0) result += " AND " + w(minor).trim() + " " + names.minor;
  return result + " ONLY";
}

interface Props {
  invoice: Invoice;
  company: CompanySettings;
}

export function InvoicePdfDocument({ invoice, company }: Props) {
  const items = invoice.items ?? [];
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const totalAmt = items.reduce((s, i) => s + i.total_amount, 0);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Title */}
        <View style={[s.border, s.borderB, s.row]}>
          <View style={[s.borderR, { width: 60, padding: 4, justifyContent: "center" }]}>
            <Text style={[s.bold, { fontSize: 7 }]}>{invoice.transport_mode}</Text>
          </View>
          <View style={{ flex: 1, padding: 4, alignItems: "center", justifyContent: "center" }}>
            <Text style={[s.bold, { fontSize: 11 }]}>INVOICE CUM PACKING LIST</Text>
          </View>
        </View>

        {/* Exporter | Invoice header */}
        <View style={[s.borderB, s.row]}>
          <View style={[s.borderR, { width: "50%", padding: 4 }]}>
            <Text style={[s.gray]}>Exporter</Text>
            <Text style={s.bold}>{company.name}</Text>
            <Text style={{ marginTop: 2 }}>{company.address}</Text>
            {company.gstin ? <Text style={{ marginTop: 3 }}>GSTIN NO: {company.gstin}</Text> : null}
          </View>
          <View style={{ width: "50%", padding: 4 }}>
            <LabelVal label="Invoice No & date" value={`${invoice.invoice_number}  DT: ${invoice.invoice_date}`} />
            <LabelVal label="Buyer's Order No." value={invoice.buyer_order_no} />
            {invoice.duty_drawback ? <LabelVal label="Duty Drawback Under" value={invoice.duty_drawback} /> : null}
            {company.bank_ad_code ? <LabelVal label="Bank AD Code" value={company.bank_ad_code} /> : null}
            {invoice.hs_code ? <LabelVal label="HS Code" value={invoice.hs_code} /> : null}
            {company.lut_arn_no ? (
              <LabelVal label="LUT ARN No" value={`${company.lut_arn_no}${company.lut_arn_date ? ` DATED - ${company.lut_arn_date}` : ""}`} />
            ) : null}
            <LabelVal label="Other Reference(s)" value={invoice.other_references || "NIL"} />
          </View>
        </View>

        {/* Consignee | Buyer */}
        <View style={[s.borderB, s.row]}>
          <View style={[s.borderR, { width: "50%", padding: 4 }]}>
            <Text style={s.gray}>Consignee</Text>
            <Text style={s.bold}>{invoice.consignee_name}</Text>
            <Text style={{ marginTop: 2 }}>{invoice.consignee_address}</Text>
          </View>
          <View style={{ width: "50%", padding: 4 }}>
            <Text style={s.gray}>Buyer (if other than consignee)</Text>
            <Text style={{ marginTop: 2 }}>{invoice.buyer_if_other}</Text>
          </View>
        </View>

        {/* Country of origin | destination */}
        <View style={[s.borderB, s.row]}>
          <View style={[s.borderR, { width: "50%", padding: 4 }]}>
            <Text style={s.gray}>Country of Origin of Goods</Text>
            <Text style={s.bold}>{invoice.country_of_origin}</Text>
          </View>
          <View style={{ width: "50%", padding: 4 }}>
            <Text style={s.gray}>Country of Final Destination</Text>
            <Text style={s.bold}>{invoice.country_of_destination}</Text>
          </View>
        </View>

        {/* Shipping grid | Terms */}
        <View style={[s.borderB, s.row]}>
          <View style={[s.borderR, { width: "50%" }]}>
            {[
              [invoice.pre_carriage_by, "Pre-Carriage by", invoice.place_of_receipt, "Place of Receipt by"],
              [invoice.pre_carrier, "", "", "Pre carrier"],
              [invoice.vessel, "Vessel", invoice.port_of_loading, "Port of Loading"],
              [invoice.port_of_discharge, "Port of Discharge", invoice.final_destination, "Final Destination"],
            ].map(([v1, l1, v2, l2], i) => (
              <View key={i} style={[s.row, { borderBottom: i < 3 ? "0.5pt solid #ccc" : undefined }]}>
                <View style={[s.borderR, { width: "50%", padding: 3 }]}>
                  {l1 ? <Text style={s.gray}>{l1}</Text> : null}
                  <Text>{v1}</Text>
                </View>
                <View style={{ width: "50%", padding: 3 }}>
                  {l2 ? <Text style={s.gray}>{l2}</Text> : null}
                  <Text>{v2}</Text>
                </View>
              </View>
            ))}
          </View>
          <View style={{ width: "50%", padding: 4 }}>
            <Text style={s.gray}>Terms of payment</Text>
            <Text style={{ marginTop: 2 }}>{invoice.terms_of_payment}</Text>
          </View>
        </View>

        {/* Items table */}
        <View style={s.borderB}>
          {/* Header */}
          <View style={[s.row, s.tableHead, s.borderB]}>
            <ColH style={{ width: "15%" }}>Marks &amp; Nos</ColH>
            <ColH style={{ width: "10%" }}>No of Pkgs</ColH>
            <ColH style={{ width: "35%" }}>Description of goods</ColH>
            <ColH style={{ width: "10%", textAlign: "right" }}>Quantity</ColH>
            <ColH style={{ width: "15%", textAlign: "right" }}>Rate</ColH>
            <ColH style={{ width: "15%", textAlign: "right" }}>Amount</ColH>
          </View>
          <View style={[s.row, { borderBottom: "0.5pt solid #ccc" }]}>
            <ColH style={{ width: "15%" }}></ColH>
            <ColH style={{ width: "10%" }}></ColH>
            <ColH style={{ width: "35%" }}></ColH>
            <ColH style={{ width: "10%", textAlign: "right", color: "#666", fontSize: 7 }}>NOS</ColH>
            <ColH style={{ width: "15%", textAlign: "right", color: "#666", fontSize: 7 }}>EX WORK {invoice.currency}</ColH>
            <ColH style={{ width: "15%", textAlign: "right", color: "#666", fontSize: 7 }}>EX WORK {invoice.currency}</ColH>
          </View>

          {/* Items */}
          {items.map((item, idx) => (
            <View key={idx} style={[s.row, { borderBottom: "0.5pt solid #ddd" }]}>
              <ColD style={{ width: "15%" }}>
                <Text>{item.marks_nos}</Text>
                {item.dimensions ? (
                  <Text style={{ marginTop: 3, color: "#555" }}>
                    {"\nDIMENSION\n"}{item.dimensions}
                  </Text>
                ) : null}
              </ColD>
              <ColD style={{ width: "10%" }}>{item.no_of_pkgs}</ColD>
              <ColD style={{ width: "35%" }}>
                <Text>{item.description}</Text>
                {item.part_number ? <Text style={{ color: "#555" }}>{item.part_number}</Text> : null}
              </ColD>
              <ColD style={{ width: "10%", textAlign: "right" }}>{fmt(item.quantity, 0)}</ColD>
              <ColD style={{ width: "15%", textAlign: "right" }}>{fmt(item.unit_price, 3)}</ColD>
              <ColD style={{ width: "15%", textAlign: "right" }}>{fmt(item.total_amount)}</ColD>
            </View>
          ))}

          {/* Weight row */}
          {(invoice.net_weight || invoice.gross_weight) && (
            <View style={[s.row, { borderBottom: "0.5pt solid #ddd" }]}>
              <ColD style={{ width: "15%", fontSize: 7 }}>
                {invoice.net_weight ? <Text>Nt Wt: {invoice.net_weight}</Text> : null}
                {invoice.gross_weight ? <Text>Gr Wt: {invoice.gross_weight}</Text> : null}
              </ColD>
              <ColD style={{ width: "85%" }}></ColD>
            </View>
          )}

          {/* Totals */}
          <View style={[s.row, s.borderT, { backgroundColor: "#f9f9f9" }]}>
            <ColH style={{ width: "60%", textAlign: "right" }}>TOTAL</ColH>
            <ColH style={{ width: "10%", textAlign: "right" }}>{fmt(totalQty, 0)}</ColH>
            <ColH style={{ width: "15%" }}></ColH>
            <ColH style={{ width: "15%", textAlign: "right" }}>{fmt(totalAmt)}</ColH>
          </View>
          <View style={[s.row, s.borderT, { backgroundColor: "#f9f9f9" }]}>
            <ColH style={{ width: "85%", textAlign: "right" }}>TOTAL {invoice.currency}</ColH>
            <ColH style={{ width: "15%", textAlign: "right" }}>{fmt(totalAmt)}</ColH>
          </View>
        </View>

        {/* In words */}
        <View style={[s.borderB, { padding: 4 }]}>
          <Text>
            <Text style={s.bold}>(IN WORDS)   </Text>
            {amountInWords(totalAmt, invoice.currency)}
          </Text>
        </View>

        {/* Declaration + signatory */}
        <View style={[s.row, { padding: 4, marginTop: 4 }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 7, color: "#555" }}>
              We declare that this invoice shows the actual price of the goods{"\n"}
              described and that all particulars are true and correct.
            </Text>
          </View>
          <View style={{ width: 180, alignItems: "flex-end" }}>
            <Text>Place : {company.place}</Text>
            <Text>Date : {invoice.invoice_date}</Text>
            <Text style={[s.bold, { marginTop: 6 }]}>For {company.name}</Text>
            <View style={{ marginTop: 30, borderTop: "0.5pt solid #666", paddingTop: 2 }}>
              <Text>Authorised Signatory</Text>
              {company.signatory_name ? (
                <Text style={{ fontSize: 7 }}>({company.signatory_name})</Text>
              ) : null}
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

function LabelVal({ label, value }: { label: string; value: string }) {
  return (
    <View style={[s.row, { marginBottom: 1 }]}>
      <Text style={[s.gray, { width: 90 }]}>{label} :</Text>
      <Text style={[s.bold, { flex: 1 }]}>{value}</Text>
    </View>
  );
}

function ColH({ children, style }: { children?: React.ReactNode; style?: Record<string, unknown> }) {
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <View style={[{ borderRight: "0.5pt solid #ccc", padding: 3 }, style] as any}>
      {typeof children === "string" ? (
        <Text style={s.bold}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}

function ColD({ children, style }: { children?: React.ReactNode; style?: Record<string, unknown> }) {
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <View style={[{ borderRight: "0.5pt solid #ddd", padding: 3 }, style] as any}>
      {typeof children === "string" ? <Text>{children}</Text> : children}
    </View>
  );
}
