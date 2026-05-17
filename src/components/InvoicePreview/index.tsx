import type { Invoice, CompanySettings } from "@/lib/types";

interface Props {
  invoice: Invoice;
  company: CompanySettings;
}

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function InvoicePreview({ invoice, company }: Props) {
  const items = invoice.items ?? [];
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const totalAmt = items.reduce((s, i) => s + i.total_amount, 0);

  return (
    <div className="font-sans text-[11px] text-black bg-white border border-gray-400 print:border-0">
      {/* Title row */}
      <div className="flex border-b border-gray-400">
        <div className="w-24 flex items-center justify-center border-r border-gray-400 font-bold text-[10px] py-1 px-1">
          {invoice.transport_mode}
        </div>
        <div className="flex-1 text-center font-bold text-sm py-1">
          INVOICE CUM PACKING LIST
        </div>
      </div>

      {/* Exporter | Invoice header */}
      <div className="flex border-b border-gray-400">
        <div className="w-1/2 border-r border-gray-400 p-2">
          <div className="text-[9px] text-gray-500 mb-0.5">Exporter</div>
          <div className="font-bold">{company.name}</div>
          <div className="whitespace-pre-line mt-0.5">{company.address}</div>
          {company.gstin && (
            <div className="mt-1">GSTIN NO: {company.gstin}</div>
          )}
        </div>
        <div className="w-1/2 p-2 space-y-0.5">
          <Row label="Invoice No &amp; date" value={`${invoice.invoice_number}  DT: ${invoice.invoice_date}`} />
          <Row label="Buyer's Order No." value={invoice.buyer_order_no} />
          {invoice.duty_drawback && (
            <Row label="Duty Drawback Under" value={invoice.duty_drawback} />
          )}
          {company.bank_ad_code && (
            <Row label="Bank AD Code" value={company.bank_ad_code} />
          )}
          {invoice.hs_code && (
            <Row label="HS Code" value={invoice.hs_code} />
          )}
          {company.lut_arn_no && (
            <Row
              label="LUT ARN No"
              value={`${company.lut_arn_no}${company.lut_arn_date ? ` DATED - ${company.lut_arn_date}` : ""}`}
            />
          )}
          <Row label="Other Reference(s)" value={invoice.other_references || "NIL"} />
        </div>
      </div>

      {/* Consignee | Buyer */}
      <div className="flex border-b border-gray-400">
        <div className="w-1/2 border-r border-gray-400 p-2">
          <div className="text-[9px] text-gray-500 mb-0.5">Consignee</div>
          <div className="font-bold">{invoice.consignee_name}</div>
          <div className="whitespace-pre-line mt-0.5">{invoice.consignee_address}</div>
        </div>
        <div className="w-1/2 p-2">
          <div className="text-[9px] text-gray-500 mb-0.5">Buyer (if other than consignee)</div>
          <div className="whitespace-pre-line">{invoice.buyer_if_other}</div>
        </div>
      </div>

      {/* Country of origin | Country of destination */}
      <div className="flex border-b border-gray-400">
        <div className="w-1/2 border-r border-gray-400 p-1.5">
          <span className="text-[9px] text-gray-500">Country of Origin of Goods</span>
          <div className="font-semibold">{invoice.country_of_origin}</div>
        </div>
        <div className="w-1/2 p-1.5">
          <span className="text-[9px] text-gray-500">Country of Final Destination</span>
          <div className="font-semibold">{invoice.country_of_destination}</div>
        </div>
      </div>

      {/* Shipping grid | Terms */}
      <div className="flex border-b border-gray-400">
        <div className="w-1/2 border-r border-gray-400">
          <ShipRow label="Pre-Carriage by" value={invoice.pre_carriage_by} label2="Place of Receipt by" value2={invoice.place_of_receipt} />
          <ShipRow label="" value={invoice.pre_carrier} label2="Pre carrier" value2="" />
          <ShipRow label="Vessel" value={invoice.vessel} label2="Port of Loading" value2={invoice.port_of_loading} />
          <ShipRow label="Port of Discharge" value={invoice.port_of_discharge} label2="Final Destination" value2={invoice.final_destination} />
        </div>
        <div className="w-1/2 p-2">
          <div className="text-[9px] text-gray-500">Terms of payment</div>
          <div className="mt-0.5">{invoice.terms_of_payment}</div>
        </div>
      </div>

      {/* Items table header */}
      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr className="border-b border-gray-400">
            <Th className="w-[15%]">Marks &amp; Nos</Th>
            <Th className="w-[10%]">No of Pkgs</Th>
            <Th className="w-[35%]">Description of goods</Th>
            <Th className="w-[10%] text-right">Quantity</Th>
            <Th className="w-[15%] text-right">Rate</Th>
            <Th className="w-[15%] text-right">Amount</Th>
          </tr>
          <tr className="border-b border-gray-300 text-gray-500">
            <Th></Th>
            <Th></Th>
            <Th></Th>
            <Th className="text-right">NOS</Th>
            <Th className="text-right">EX WORK {invoice.currency}</Th>
            <Th className="text-right">EX WORK {invoice.currency}</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-gray-200">
              <Td className="align-top">
                <div>{item.marks_nos}</div>
                {item.dimensions && (
                  <div className="mt-1 text-gray-600">
                    <div>DIMENSION</div>
                    <div>{item.dimensions}</div>
                  </div>
                )}
              </Td>
              <Td className="align-top">{item.no_of_pkgs}</Td>
              <Td className="align-top">
                <div>{item.description}</div>
                {item.part_number && (
                  <div className="text-gray-600">{item.part_number}</div>
                )}
              </Td>
              <Td className="text-right align-top">{fmt(item.quantity, 0)}</Td>
              <Td className="text-right align-top">{fmt(item.unit_price, 3)}</Td>
              <Td className="text-right align-top">{fmt(item.total_amount)}</Td>
            </tr>
          ))}
          {/* weight row */}
          {(invoice.net_weight || invoice.gross_weight) && (
            <tr className="border-b border-gray-200">
              <Td className="text-[9px]">
                {invoice.net_weight && <div>Nt Wt: {invoice.net_weight}</div>}
                {invoice.gross_weight && <div>Gr Wt: {invoice.gross_weight}</div>}
              </Td>
              <Td colSpan={5}></Td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-400 font-semibold">
            <Td colSpan={3} className="text-right pr-2">TOTAL</Td>
            <Td className="text-right">{fmt(totalQty, 0)}</Td>
            <Td></Td>
            <Td className="text-right">{fmt(totalAmt)}</Td>
          </tr>
          <tr className="font-semibold border-t border-gray-400">
            <Td colSpan={5} className="text-right pr-2">TOTAL {invoice.currency}</Td>
            <Td className="text-right">{fmt(totalAmt)}</Td>
          </tr>
        </tfoot>
      </table>

      {/* In words */}
      <div className="border-t border-gray-400 p-2 text-[10px]">
        <span className="font-semibold">(IN WORDS)&nbsp;&nbsp;</span>
        {amountInWords(totalAmt, invoice.currency)}
      </div>

      {/* Declaration + Signatory */}
      <div className="border-t border-gray-400 p-2 flex justify-between">
        <div className="text-[9px] text-gray-700 max-w-sm">
          We declare that this invoice shows the actual price of the goods
          described and that all particulars are true and correct.
        </div>
        <div className="text-right text-[10px]">
          <div>Place : {company.place}</div>
          <div>Date : {invoice.invoice_date}</div>
          <div className="mt-2 font-bold">For {company.name}</div>
          <div className="mt-6 border-t border-gray-400 pt-0.5">Authorised Signatory</div>
          {company.signatory_name && (
            <div className="text-[9px]">({company.signatory_name})</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1">
      <span className="text-gray-500 shrink-0"
        dangerouslySetInnerHTML={{ __html: label + (label ? " :" : "") }}
      />
      <span className="font-medium">{value}</span>
    </div>
  );
}

function ShipRow({
  label, value, label2, value2,
}: {
  label: string; value: string; label2: string; value2: string;
}) {
  return (
    <div className="flex border-b border-gray-300 last:border-0">
      <div className="w-1/2 border-r border-gray-300 p-1">
        {label && <div className="text-[9px] text-gray-500">{label}</div>}
        <div>{value}</div>
      </div>
      <div className="w-1/2 p-1">
        {label2 && <div className="text-[9px] text-gray-500">{label2}</div>}
        <div>{value2}</div>
      </div>
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`border border-gray-400 p-1 font-semibold text-left ${className ?? ""}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  colSpan,
  className,
}: {
  children?: React.ReactNode;
  colSpan?: number;
  className?: string;
}) {
  return (
    <td colSpan={colSpan} className={`border border-gray-300 p-1 ${className ?? ""}`}>
      {children}
    </td>
  );
}

// Basic number-to-words for USD/EUR/INR amounts
function amountInWords(amount: number, currency: string): string {
  const ones = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
    "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN",
    "EIGHTEEN", "NINETEEN"];
  const tens = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];

  function toWords(n: number): string {
    if (n === 0) return "";
    if (n < 20) return ones[n] + " ";
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "") + " ";
    if (n < 1000) return ones[Math.floor(n / 100)] + " HUNDRED " + toWords(n % 100);
    if (n < 100000) return toWords(Math.floor(n / 1000)) + "THOUSAND " + toWords(n % 1000);
    if (n < 10000000) return toWords(Math.floor(n / 100000)) + "LAKH " + toWords(n % 100000);
    return toWords(Math.floor(n / 10000000)) + "CRORE " + toWords(n % 10000000);
  }

  const dollars = Math.floor(amount);
  const cents = Math.round((amount - dollars) * 100);

  const currencyMap: Record<string, { major: string; minor: string }> = {
    USD: { major: "US DOLLAR", minor: "CENTS" },
    EUR: { major: "EURO", minor: "CENTS" },
    GBP: { major: "POUND STERLING", minor: "PENCE" },
    AED: { major: "UAE DIRHAM", minor: "FILS" },
    INR: { major: "INDIAN RUPEE", minor: "PAISE" },
  };
  const names = currencyMap[currency] ?? { major: currency, minor: "CENTS" };

  let result = toWords(dollars).trim() + " " + names.major;
  if (cents > 0) result += " AND " + toWords(cents).trim() + " " + names.minor;
  return result + " ONLY";
}
