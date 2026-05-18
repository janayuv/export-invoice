import {
  Document,
  Page,
  Text,
  View,
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

const s = StyleSheet.create({
  page: { padding: 24, fontSize: 8, fontFamily: "Helvetica" },
  outer: { border: "1pt solid #000" },
  bold: { fontFamily: "Helvetica-Bold" },
  borderB: { borderBottom: "1pt solid #000" },
  borderR: { borderRight: "1pt solid #000" },
  row: { flexDirection: "row" },
  cell: { padding: 4 },
  label: { fontSize: 7, color: "#333" },
  tableHead: { fontFamily: "Helvetica-Bold", backgroundColor: "#fff" },
  sectionBanner: {
    fontFamily: "Helvetica-Bold",
    backgroundColor: "#f1f5f9",
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderBottom: "1pt solid #000",
    fontSize: 8,
    letterSpacing: 0.5,
  },
});

interface Props {
  invoice: Invoice;
  company: CompanySettings;
}

export function InvoicePdfDocument({ invoice, company }: Props) {
  const items = invoice.items ?? [];
  const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalAmt = items.reduce((sum, i) => sum + i.total_amount, 0);
  const refs = invoiceReferenceRows(invoice, company);
  const rateLabel = rateColumnLabel(invoice.incoterm, invoice.currency);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.outer}>
          {/* Transport mode + centered title */}
          <View style={[s.row, s.borderB]}>
            <View style={[s.borderR, { width: 56, justifyContent: "center", alignItems: "center", padding: 4 }]}>
              <Text style={[s.bold, { fontSize: 8 }]}>{invoice.transport_mode}</Text>
            </View>
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 5 }}>
              <Text style={[s.bold, { fontSize: 11 }]}>INVOICE CUM PACKING LIST</Text>
            </View>
          </View>

          {/* Exporter | Invoice references */}
          <View style={[s.row, s.borderB]}>
            <View style={[s.borderR, { width: "50%", padding: 4 }]}>
              <Text style={s.label}>Exporter</Text>
              <Text style={[s.bold, { marginTop: 2 }]}>{company.name}</Text>
              <Text style={{ marginTop: 2 }}>{company.address}</Text>
              {company.gstin ? (
                <Text style={{ marginTop: 4 }}>GSTIN NO: {company.gstin}</Text>
              ) : null}
              {company.iec ? <Text style={{ marginTop: 1 }}>IEC: {company.iec}</Text> : null}
              {company.pan ? <Text style={{ marginTop: 1 }}>PAN: {company.pan}</Text> : null}
            </View>
            <View style={{ width: "50%" }}>
              {/* Invoice No & Date — prominent box at top of right column */}
              <View style={[s.borderB, { padding: 4, backgroundColor: "#eef2ff" }]}>
                <Text style={[s.label, { letterSpacing: 0.3 }]}>INVOICE NO &amp; DATE</Text>
                <Text style={[s.bold, { fontSize: 10, marginTop: 2 }]}>{refs[0].value}</Text>
              </View>
              <View style={{ padding: 4 }}>
                {refs.slice(1).map((row) => (
                  <RefRow key={row.label} label={row.label} value={row.value} />
                ))}
              </View>
            </View>
          </View>

          {/* Consignee + shipping (left) | Buyer + countries + terms (right) */}
          <View style={[s.row, s.borderB]}>
            <View style={[s.borderR, { width: "50%" }]}>
              <View style={[s.cell, s.borderB]}>
                <Text style={s.label}>Consignee</Text>
                <Text style={[s.bold, { marginTop: 2 }]}>{invoice.consignee_name}</Text>
                <Text style={{ marginTop: 2 }}>{invoice.consignee_address}</Text>
              </View>
              <ShipCell
                leftLabel="Pre-Carriage by"
                leftValue={invoice.pre_carriage_by}
                rightLabel="Place of Receipt by"
                rightValue={invoice.place_of_receipt}
                borderB
              />
              <ShipCell
                leftLabel=""
                leftValue={invoice.pre_carrier}
                rightLabel="Pre carrier"
                rightValue=""
                borderB
              />
              <ShipCell
                leftLabel="Vessel"
                leftValue={invoice.vessel}
                rightLabel="Port of Loading"
                rightValue={invoice.port_of_loading}
                borderB
              />
              <ShipCell
                leftLabel="Port of Discharge"
                leftValue={invoice.port_of_discharge}
                rightLabel="Final Destination"
                rightValue={invoice.final_destination}
              />
            </View>

            <View style={{ width: "50%" }}>
              <View style={[s.cell, s.borderB, { minHeight: 52 }]}>
                <Text style={s.label}>Buyer (If other than consignee)</Text>
                <Text style={{ marginTop: 2 }}>{invoice.buyer_if_other}</Text>
              </View>
              <View style={[s.row, s.borderB]}>
                <View style={[s.borderR, { width: "50%", padding: 4 }]}>
                  <Text style={s.label}>Country of Origin of Goods</Text>
                  <Text style={[s.bold, { marginTop: 2 }]}>{invoice.country_of_origin}</Text>
                </View>
                <View style={{ width: "50%", padding: 4 }}>
                  <Text style={s.label}>Country of Final Destination</Text>
                  <Text style={[s.bold, { marginTop: 2 }]}>{invoice.country_of_destination}</Text>
                </View>
              </View>
              <View style={[s.cell, { minHeight: 40 }]}>
                <Text style={s.label}>Terms of payment:</Text>
                <Text style={{ marginTop: 2 }}>{invoice.terms_of_payment}</Text>
              </View>
            </View>
          </View>

          {/* GOODS section */}
          <View>
            <Text style={s.sectionBanner}>GOODS</Text>
            <View style={[s.row, s.tableHead, s.borderB]}>
              <Th w="6%" align="center">Sr.</Th>
              <Th w="16%">Part Number</Th>
              <Th w="42%">Description of goods</Th>
              <Th w="10%" align="right">Quantity</Th>
              <Th w="13%" align="right">Rate</Th>
              <Th w="13%" align="right">Amount</Th>
            </View>
            <View style={[s.row, s.borderB]}>
              <Th w="6%"></Th>
              <Th w="16%"></Th>
              <Th w="42%"></Th>
              <Th w="10%" align="right" sub>NOS</Th>
              <Th w="13%" align="right" sub>{rateLabel}</Th>
              <Th w="13%" align="right" sub last>{rateLabel}</Th>
            </View>

            {items.map((item, idx) => (
              <View key={`g-${idx}`} style={[s.row, { borderBottom: "0.5pt solid #ccc" }]}>
                <Td w="6%" align="center">{String(item.sr_no)}</Td>
                <Td w="16%">{item.part_number}</Td>
                <Td w="42%">{item.description}</Td>
                <Td w="10%" align="right">{fmtAmount(item.quantity, 0)}</Td>
                <Td w="13%" align="right">{fmtAmount(item.unit_price, 3)}</Td>
                <Td w="13%" align="right" last>{fmtAmount(item.total_amount)}</Td>
              </View>
            ))}

            <View style={[s.row, s.borderB, { borderTop: "1pt solid #000", backgroundColor: "#f8fafc" }]}>
              <Td w="64%" align="right" bold last>TOTAL</Td>
              <Td w="10%" align="right" bold>{fmtAmount(totalQty, 0)}</Td>
              <Td w="13%"></Td>
              <View style={{ width: "13%", padding: 3, alignItems: "flex-end", backgroundColor: "#e0e7ff" }}>
                <Text style={[s.bold, { fontSize: 9 }]}>{fmtAmount(totalAmt)}</Text>
              </View>
            </View>
          </View>

          {/* Amount in words */}
          <View style={[s.borderB, { padding: 4 }]}>
            <Text>
              <Text style={s.bold}>(IN WORDS)   </Text>
              {amountInWords(totalAmt, invoice.currency)}
            </Text>
          </View>

          {/* PACKING section */}
          <View>
            <Text style={s.sectionBanner}>PACKING LIST</Text>
            <View style={[s.row, s.tableHead, s.borderB]}>
              <Th w="6%" align="center">Sr.</Th>
              <Th w="34%">Marks &amp; Nos</Th>
              <Th w="14%">No of Pkgs</Th>
              <Th w="34%">Dimensions</Th>
              <Th w="12%" last>Unit</Th>
            </View>

            {items.map((item, idx) => (
              <View key={`p-${idx}`} style={[s.row, { borderBottom: "0.5pt solid #ccc" }]}>
                <Td w="6%" align="center">{String(item.sr_no)}</Td>
                <Td w="34%">{item.marks_nos}</Td>
                <Td w="14%">{item.no_of_pkgs}</Td>
                <Td w="34%">{item.dimensions}</Td>
                <Td w="12%" last>{item.dimensions_unit}</Td>
              </View>
            ))}

            {(invoice.net_weight || invoice.gross_weight) ? (
              <View style={[s.row, { borderBottom: "0.5pt solid #ccc", padding: 3 }]}>
                <Text style={{ fontSize: 7 }}>
                  {invoice.net_weight ? `Nt Wt: ${invoice.net_weight}   ` : ""}
                  {invoice.gross_weight ? `Gr Wt: ${invoice.gross_weight}` : ""}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Declaration + signature */}
          <View style={[s.row, { padding: 4, borderTop: "1pt solid #000" }]}>
            <View style={{ width: "58%", paddingRight: 8 }}>
              <Text style={{ fontSize: 7 }}>
                We declare that this invoice shows the actual price of the goods{"\n"}
                described and that all particulars are true and correct.
              </Text>
              {company.lut_arn_no ? (
                <Text style={{ fontSize: 7, marginTop: 4 }}>
                  Export under LUT ARN: {company.lut_arn_no}
                  {company.lut_arn_date
                    ? ` dated ${formatInvoiceDisplayDate(company.lut_arn_date)}`
                    : ""}
                </Text>
              ) : null}
              <Text style={{ marginTop: 8 }}>Place : {company.place}</Text>
              <Text>Date : {formatInvoiceDisplayDate(invoice.invoice_date)}</Text>
            </View>
            <View style={{ width: "42%", alignItems: "flex-end" }}>
              <Text style={s.bold}>For {company.name}</Text>
              <View style={{ marginTop: 28, borderTop: "0.5pt solid #666", paddingTop: 2, minWidth: 140 }}>
                <Text>Authorised Signatory</Text>
                {company.signatory_name ? (
                  <Text style={{ fontSize: 7 }}>({company.signatory_name})</Text>
                ) : null}
              </View>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

function RefRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={[s.row, { marginBottom: 2 }]}>
      <Text style={[s.label, { width: 108 }]}>{label}</Text>
      <Text style={[s.bold, { flex: 1 }]}>{value}</Text>
    </View>
  );
}

function ShipCell({
  leftLabel,
  leftValue,
  rightLabel,
  rightValue,
  borderB,
}: {
  leftLabel: string;
  leftValue: string;
  rightLabel: string;
  rightValue: string;
  borderB?: boolean;
}) {
  return (
    <View style={[s.row, ...(borderB ? [s.borderB] : [])]}>
      <View style={[s.borderR, { width: "50%", padding: 3 }]}>
        {leftLabel ? <Text style={s.label}>{leftLabel}</Text> : null}
        <Text>{leftValue}</Text>
      </View>
      <View style={{ width: "50%", padding: 3 }}>
        {rightLabel ? <Text style={s.label}>{rightLabel}</Text> : null}
        <Text>{rightValue}</Text>
      </View>
    </View>
  );
}

function Th({
  children,
  w,
  align,
  sub,
  last,
}: {
  children?: React.ReactNode;
  w: string;
  align?: "right" | "center";
  sub?: boolean;
  last?: boolean;
}) {
  return (
    <View
      style={[
        {
          width: w,
          padding: 3,
          borderRight: last ? undefined : "0.5pt solid #000",
        },
        align === "right" ? { alignItems: "flex-end" } : {},
        align === "center" ? { alignItems: "center" } : {},
      ]}
    >
      {typeof children === "string" ? (
        <Text style={[sub ? { fontSize: 7, color: "#444" } : s.bold]}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}

function Td({
  children,
  w,
  align,
  bold,
  last,
}: {
  children?: React.ReactNode;
  w: string;
  align?: "right" | "center";
  bold?: boolean;
  last?: boolean;
}) {
  return (
    <View
      style={[
        {
          width: w,
          padding: 3,
          borderRight: last ? undefined : "0.5pt solid #ccc",
        },
        align === "right" ? { alignItems: "flex-end" } : {},
        align === "center" ? { alignItems: "center" } : {},
      ]}
    >
      {typeof children === "string" ? (
        <Text style={bold ? s.bold : undefined}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}
