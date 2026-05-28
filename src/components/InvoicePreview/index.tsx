import type { Invoice, CompanySettings } from "@/lib/types";
import {
  amountInWords,
  fmtAmount,
  formatInvoiceDisplayDate,
  invoiceReferenceRows,
  rateColumnLabel,
} from "@/lib/invoiceDocument";

interface Props {
  invoice: Invoice;
  company: CompanySettings;
}

// Palette that mirrors the A4 PDF export
const C = {
  border:    "1.5px solid #000",
  borderThin:"1px solid #000",
  borderGray:"1px solid #d0d0d0",
  headerBg:  "#ececec",
  totalBg:   "#f5f5e8",
  wordsBg:   "#fbfbf5",
  packingBg: "#e4e4e4",
  refHighBg: "#eef0ff",
  refHighTxt:"#312e81",
} as const;

export function InvoicePreview({ invoice, company }: Props) {
  const items       = invoice.items ?? [];
  const packingList = invoice.packing_list ?? [];
  const totalQty    = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalAmt    = items.reduce((sum, i) => sum + i.total_amount, 0);
  const refs        = invoiceReferenceRows(invoice, company);
  const rateLabel   = rateColumnLabel(invoice.incoterm, invoice.currency);
  const showSa      = invoice.show_sa_number ?? true;

  return (
    /* A4 document shell */
    <div
      style={{
        fontFamily: "Courier New, Courier, monospace",
        fontSize:   "8.5pt",
        color:      "#000",
        background: "#fff",
        maxWidth:   760,
        margin:     "0 auto",
        border:     C.border,
      }}
    >

      {/* ── 1. Header: Logo | Title | Mode ── */}
      <div style={{ display: "flex", borderBottom: C.border }}>
        <div
          style={{
            width: "35%",
            borderRight: C.border,
            padding: "8px 10px",
            display: "flex",
            alignItems: "center",
          }}
        >
          {invoice.company_logo_base64 ? (
            <img
              src={invoice.company_logo_base64}
              alt="Company logo"
              style={{ maxHeight: 52, maxWidth: "100%", objectFit: "contain" }}
            />
          ) : (
            <span style={{ fontWeight: 700, fontSize: "9pt" }}>{company.name}</span>
          )}
        </div>
        <div
          style={{
            flex: 1,
            textAlign: "center",
            fontWeight: 800,
            fontSize: "11pt",
            padding: "10px 8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            letterSpacing: "0.06em",
          }}
        >
          INVOICE CUM PACKING LIST
        </div>
        <div
          style={{
            width: "19%",
            borderLeft: C.border,
            padding: "6px 8px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ fontSize: "7pt", color: "#555", letterSpacing: "0.05em" }}>
            TRANSPORT MODE
          </div>
          <div style={{ fontWeight: 700, marginTop: 2 }}>{invoice.transport_mode}</div>
        </div>
      </div>

      {/* ── 2. Exporter | References ── */}
      <div style={{ display: "flex", borderBottom: C.border }}>
        <div style={{ width: "48%", borderRight: C.border, padding: "8px 10px" }}>
          <div style={{ fontSize: "7pt", color: "#666", marginBottom: 2 }}>Exporter</div>
          <div style={{ fontWeight: 700, fontSize: "9pt" }}>{company.name}</div>
          <div style={{ whiteSpace: "pre-line", marginTop: 3 }}>{company.address}</div>
          {company.gstin && <div style={{ marginTop: 4 }}>GSTIN NO: {company.gstin}</div>}
          {company.iec   && <div style={{ marginTop: 2 }}>IEC: {company.iec}</div>}
          {company.pan   && <div style={{ marginTop: 2 }}>PAN: {company.pan}</div>}
        </div>
        <div style={{ width: "52%", display: "flex", flexDirection: "column" }}>
          {/* First ref row — highlighted */}
          <div
            style={{
              background: C.refHighBg,
              borderBottom: C.borderThin,
              padding: "6px 10px",
            }}
          >
            <div
              style={{
                fontSize: "7pt",
                color: "#666",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {refs[0].label}
            </div>
            <div
              style={{
                fontWeight: 700,
                fontSize: "8.5pt",
                marginTop: 2,
                color: C.refHighTxt,
              }}
            >
              {refs[0].value}
            </div>
          </div>
          <div style={{ padding: "6px 10px" }}>
            {refs.slice(1).map((row) => (
              <RefRow key={row.label} label={row.label} value={row.value} />
            ))}
          </div>
        </div>
      </div>

      {/* ── 3. Consignee + shipping | Buyer + countries + terms ── */}
      <div style={{ display: "flex", borderBottom: C.border }}>
        <div style={{ width: "50%", borderRight: C.border }}>
          <div style={{ padding: "8px 10px", borderBottom: C.borderThin }}>
            <div style={{ fontSize: "7pt", color: "#666" }}>Consignee</div>
            <div style={{ fontWeight: 700, fontSize: "9pt", marginTop: 2 }}>
              {invoice.consignee_name}
            </div>
            <div style={{ whiteSpace: "pre-line", marginTop: 2 }}>{invoice.consignee_address}</div>
          </div>
          <ShipRow label="Pre-Carriage by"   value={invoice.pre_carriage_by}  label2="Place of Receipt by" value2={invoice.place_of_receipt} />
          <ShipRow label=""                  value={invoice.pre_carrier}       label2="Pre carrier"         value2="" />
          <ShipRow label="Vessel"            value={invoice.vessel}            label2="Port of Loading"     value2={invoice.port_of_loading} />
          <ShipRow label="Port of Discharge" value={invoice.port_of_discharge} label2="Final Destination"   value2={invoice.final_destination} last />
        </div>
        <div style={{ width: "50%", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "8px 10px", borderBottom: C.borderThin, minHeight: 52 }}>
            <div style={{ fontSize: "7pt", color: "#666" }}>Buyer (If other than consignee)</div>
            <div style={{ whiteSpace: "pre-line", marginTop: 2 }}>{invoice.buyer_if_other}</div>
          </div>
          <div style={{ padding: "6px 10px", borderBottom: C.borderThin }}>
            <div style={{ fontSize: "7pt", color: "#666" }}>Country of Origin of Goods</div>
            <div style={{ fontWeight: 600, marginTop: 2 }}>{invoice.country_of_origin}</div>
          </div>
          <div style={{ padding: "6px 10px", borderBottom: C.borderThin }}>
            <div style={{ fontSize: "7pt", color: "#666" }}>Terms of payment:</div>
            <div style={{ marginTop: 2 }}>{invoice.terms_of_payment}</div>
          </div>
          <div style={{ padding: "6px 10px", flex: 1 }}>
            <div style={{ fontSize: "7pt", color: "#666" }}>Incoterm:</div>
            <div style={{ marginTop: 2 }}>{invoice.incoterm}</div>
          </div>
        </div>
      </div>

      {/* ── 4. GOODS section ── */}
      <div
        style={{
          padding: "5px 9px",
          fontWeight: 700,
          fontSize: "9pt",
          letterSpacing: "0.12em",
          background: C.packingBg,
          borderBottom: C.borderThin,
        }}
      >
        GOODS
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "8pt" }}>
        <thead>
          <tr style={{ background: C.headerBg, borderBottom: C.borderThin }}>
            <Th style={{ width: showSa ? "5%"  : "6%",  textAlign: "center" }}>Sr.</Th>
            {showSa && <Th style={{ width: "10%" }}>SA No.</Th>}
            <Th style={{ width: showSa ? "14%" : "16%" }}>Part No.</Th>
            <Th style={{ width: showSa ? "38%" : "42%" }}>Description of goods</Th>
            <Th style={{ width: "10%", textAlign: "right" }}>Qty</Th>
            <Th style={{ width: showSa ? "11%" : "13%", textAlign: "right" }}>
              Rate<br />({rateLabel})
            </Th>
            <Th style={{ width: showSa ? "12%" : "13%", textAlign: "right" }}>
              Amount<br />({invoice.currency})
            </Th>
          </tr>
          <tr style={{ borderBottom: C.borderGray, color: "#777" }}>
            <Th></Th>
            {showSa && <Th></Th>}
            <Th></Th>
            <Th></Th>
            <Th style={{ textAlign: "right" }}>NOS</Th>
            <Th style={{ textAlign: "right" }}>{rateLabel}</Th>
            <Th style={{ textAlign: "right" }}>{rateLabel}</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id ?? item.sr_no} style={{ borderBottom: C.borderGray }}>
              <Td style={{ textAlign: "center", verticalAlign: "top" }}>{item.sr_no}</Td>
              {showSa && <Td style={{ verticalAlign: "top" }}>{item.sa_number}</Td>}
              <Td style={{ fontFamily: "Courier New, monospace", verticalAlign: "top" }}>
                {item.part_number}
              </Td>
              <Td style={{ verticalAlign: "top" }}>{item.description}</Td>
              <Td style={{ textAlign: "right", verticalAlign: "top" }}>{fmtAmount(item.quantity, 0)}</Td>
              <Td style={{ textAlign: "right", verticalAlign: "top" }}>{fmtAmount(item.unit_price, 3)}</Td>
              <Td style={{ textAlign: "right", verticalAlign: "top" }}>{fmtAmount(item.total_amount)}</Td>
            </tr>
          ))}
          <tr style={{ background: C.totalBg, borderTop: C.borderThin, fontWeight: 700 }}>
            <Td colSpan={showSa ? 4 : 3} style={{ textAlign: "right", paddingRight: 8 }}>TOTAL</Td>
            <Td style={{ textAlign: "right" }}>{fmtAmount(totalQty, 0)}</Td>
            <Td></Td>
            <Td style={{ textAlign: "right", background: "#e8e8f8" }}>{fmtAmount(totalAmt)}</Td>
          </tr>
        </tbody>
      </table>

      {/* ── 5. Amount in words ── */}
      <div
        style={{
          padding: "6px 9px",
          fontSize: "8pt",
          fontStyle: "italic",
          background: C.wordsBg,
          borderTop: C.border,
          borderBottom: C.border,
        }}
      >
        <span style={{ fontWeight: 700, fontStyle: "normal" }}>(IN WORDS)&nbsp;&nbsp;</span>
        {amountInWords(totalAmt, invoice.currency)}
      </div>

      {/* ── 6. PACKING LIST bar ── */}
      <div
        style={{
          padding: "5px 9px",
          fontWeight: 700,
          fontSize: "9pt",
          letterSpacing: "0.12em",
          background: C.packingBg,
          borderBottom: C.borderThin,
        }}
      >
        PACKING LIST
      </div>

      {/* ── 7. Packing table ── */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "8pt" }}>
        <thead>
          <tr style={{ background: C.headerBg, borderBottom: C.borderThin }}>
            <Th style={{ width: "6%",  textAlign: "center" }}>Sr.</Th>
            <Th style={{ width: "34%" }}>Marks &amp; Nos</Th>
            <Th style={{ width: "14%" }}>No of Pkgs</Th>
            <Th style={{ width: "34%" }}>Dimensions</Th>
            <Th style={{ width: "12%" }}>Unit</Th>
          </tr>
        </thead>
        <tbody>
          {packingList.map((row, idx) => (
            <tr key={idx} style={{ borderBottom: C.borderGray }}>
              <Td style={{ textAlign: "center", verticalAlign: "top" }}>{idx + 1}</Td>
              <Td style={{ verticalAlign: "top" }}>{row.marks_nos}</Td>
              <Td style={{ verticalAlign: "top" }}>{row.no_of_pkgs}</Td>
              <Td style={{ verticalAlign: "top" }}>{row.dimensions}</Td>
              <Td style={{ verticalAlign: "top" }}>{row.dimensions_unit}</Td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── 8. Weight bar ── */}
      <div
        style={{
          display: "flex",
          gap: 32,
          padding: "5px 9px",
          fontSize: "8pt",
          borderTop: C.border,
          borderBottom: C.border,
        }}
      >
        <span>Net Weight: {invoice.net_weight} Kgs</span>
        <span>Gross Weight: {invoice.gross_weight} Kgs</span>
      </div>

      {/* ── 9. Declaration + signatory footer ── */}
      <div style={{ display: "flex", minHeight: 90 }}>
        <div
          style={{
            flex: "0 0 68%",
            borderRight: C.border,
            padding: "8px 10px",
            fontSize: "8pt",
          }}
        >
          <p>
            We declare that this invoice shows the actual price of the goods described and that all
            particulars are true and correct.
          </p>
          {company.lut_arn_no && (
            <p style={{ marginTop: 8 }}>
              Export under LUT ARN: {company.lut_arn_no}
              {company.lut_arn_date
                ? ` dated ${formatInvoiceDisplayDate(company.lut_arn_date)}`
                : ""}
            </p>
          )}
          <div style={{ marginTop: 12, fontSize: "8pt" }}>
            <div>Place : {company.place}</div>
            <div>Date : {formatInvoiceDisplayDate(invoice.invoice_date)}</div>
          </div>
        </div>
        <div
          style={{
            flex: "0 0 32%",
            padding: "8px 10px",
            textAlign: "right",
            fontSize: "8pt",
          }}
        >
          <div style={{ fontWeight: 700 }}>For {company.name}</div>
          <div
            style={{
              marginTop: 32,
              borderTop: "1px solid #888",
              paddingTop: 3,
              display: "inline-block",
              minWidth: 140,
              textAlign: "left",
            }}
          >
            <div>AUTHORIZED SIGNATORY</div>
            {company.signatory_name && (
              <div style={{ fontSize: "7pt", marginTop: 1 }}>({company.signatory_name})</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RefRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        lineHeight: 1.4,
        marginBottom: 3,
        borderBottom: "1px solid #d0d0d0",
        paddingBottom: 3,
      }}
    >
      <span style={{ fontSize: "7pt", color: "#666", flexShrink: 0, width: 112 }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function ShipRow({
  label,
  value,
  label2,
  value2,
  last,
}: {
  label: string;
  value: string;
  label2: string;
  value2: string;
  last?: boolean;
}) {
  return (
    <div style={{ display: "flex", borderBottom: last ? "none" : "1px solid #000" }}>
      <div style={{ width: "50%", borderRight: "1px solid #000", padding: "5px 8px" }}>
        {label && <div style={{ fontSize: "7pt", color: "#666" }}>{label}</div>}
        <div>{value}</div>
      </div>
      <div style={{ width: "50%", padding: "5px 8px" }}>
        {label2 && <div style={{ fontSize: "7pt", color: "#666" }}>{label2}</div>}
        <div>{value2}</div>
      </div>
    </div>
  );
}

function Th({
  children,
  style,
  colSpan,
}: {
  children?: React.ReactNode;
  style?: React.CSSProperties;
  colSpan?: number;
}) {
  return (
    <th
      colSpan={colSpan}
      style={{
        border: "1px solid #000",
        padding: "3px 5px",
        fontWeight: 700,
        textAlign: "left",
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  colSpan,
  style,
}: {
  children?: React.ReactNode;
  colSpan?: number;
  style?: React.CSSProperties;
}) {
  return (
    <td
      colSpan={colSpan}
      style={{
        border: "1px solid #d0d0d0",
        padding: "3px 5px",
        ...style,
      }}
    >
      {children}
    </td>
  );
}
