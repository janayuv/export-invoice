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

export function InvoicePreview({ invoice, company }: Props) {
  const items = invoice.items ?? [];
  const packingList = invoice.packing_list ?? [];
  const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalAmt = items.reduce((sum, i) => sum + i.total_amount, 0);
  const refs = invoiceReferenceRows(invoice, company);
  const rateLabel = rateColumnLabel(invoice.incoterm, invoice.currency);
  const showSa = invoice.show_sa_number ?? true;

  return (
    <div className="font-sans text-[11px] text-black bg-white">
      <div className="border border-black">
      <div className="flex border-b border-black">
        <div className="w-16 shrink-0 flex items-center justify-center border-r border-black font-bold text-[10px] py-1.5 px-1">
          {invoice.transport_mode}
        </div>
        <div className="flex-1 text-center font-bold text-sm py-1.5 tracking-wide">
          INVOICE CUM PACKING LIST
        </div>
      </div>

      {/* Exporter | Invoice header */}
      <div className="flex border-b border-black">
        <div className="w-1/2 border-r border-black p-2">
          <div className="text-[9px] text-gray-500 mb-0.5">Exporter</div>
          <div className="font-bold">{company.name}</div>
          <div className="whitespace-pre-line mt-0.5">{company.address}</div>
          {company.gstin && (
            <div className="mt-1">GSTIN NO: {company.gstin}</div>
          )}
          {company.iec && <div className="mt-0.5">IEC: {company.iec}</div>}
          {company.pan && <div className="mt-0.5">PAN: {company.pan}</div>}
        </div>
        <div className="w-1/2 flex flex-col">
          {/* Invoice No & Date — prominent box at top of right column */}
          <div className="border-b border-black bg-indigo-50 px-2 py-1.5">
            <div className="text-[9px] text-gray-600 uppercase tracking-wide">Invoice No &amp; Date</div>
            <div className="font-bold text-sm mt-0.5">{refs[0].value}</div>
          </div>
          <div className="p-2 space-y-0.5">
            {refs.slice(1).map((row) => (
              <RefRow key={row.label} label={row.label} value={row.value} />
            ))}
          </div>
        </div>
      </div>

      {/* Consignee + shipping | buyer + countries + terms */}
      <div className="flex border-b border-black">
        <div className="w-1/2 border-r border-black">
          <div className="p-2 border-b border-black">
            <div className="text-[9px] text-gray-600">Consignee</div>
            <div className="font-bold mt-0.5">{invoice.consignee_name}</div>
            <div className="whitespace-pre-line mt-0.5">{invoice.consignee_address}</div>
          </div>
          <ShipRow
            label="Pre-Carriage by"
            value={invoice.pre_carriage_by}
            label2="Place of Receipt by"
            value2={invoice.place_of_receipt}
          />
          <ShipRow label="" value={invoice.pre_carrier} label2="Pre carrier" value2="" />
          <ShipRow
            label="Vessel"
            value={invoice.vessel}
            label2="Port of Loading"
            value2={invoice.port_of_loading}
          />
          <ShipRow
            label="Port of Discharge"
            value={invoice.port_of_discharge}
            label2="Final Destination"
            value2={invoice.final_destination}
            last
          />
        </div>
        <div className="w-1/2 flex flex-col">
          <div className="p-2 border-b border-black min-h-[52px]">
            <div className="text-[9px] text-gray-600">Buyer (If other than consignee)</div>
            <div className="whitespace-pre-line mt-0.5">{invoice.buyer_if_other}</div>
          </div>
          <div className="flex border-b border-black">
            <div className="w-1/2 border-r border-black p-2">
              <div className="text-[9px] text-gray-600">Country of Origin of Goods</div>
              <div className="font-semibold mt-0.5">{invoice.country_of_origin}</div>
            </div>
            <div className="w-1/2 p-2">
              <div className="text-[9px] text-gray-600">Country of Final Destination</div>
              <div className="font-semibold mt-0.5">{invoice.country_of_destination}</div>
            </div>
          </div>
          <div className="p-2 border-b border-black">
            <div className="text-[9px] text-gray-600">Terms of payment:</div>
            <div className="mt-0.5">{invoice.terms_of_payment}</div>
          </div>
          <div className="p-2 flex-1">
            <div className="text-[9px] text-gray-600">Incoterm:</div>
            <div className="mt-0.5">{invoice.incoterm}</div>
          </div>
        </div>
      </div>

      {/* GOODS section */}
      <div className="px-2 pt-2 pb-1 border-b border-black bg-slate-50 font-semibold text-[10px] tracking-wide">
        GOODS
      </div>
      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr className="border-b border-black">
            <Th className={`${showSa ? "w-[5%]" : "w-[6%]"} text-center`}>Sr.</Th>
            {showSa && <Th className="w-[10%]">SA Number</Th>}
            <Th className={showSa ? "w-[14%]" : "w-[16%]"}>Part Number</Th>
            <Th className={showSa ? "w-[38%]" : "w-[42%]"}>Description of goods</Th>
            <Th className="w-[10%] text-right">Quantity</Th>
            <Th className={`${showSa ? "w-[11%]" : "w-[13%]"} text-right`}>Rate</Th>
            <Th className={`${showSa ? "w-[12%]" : "w-[13%]"} text-right`}>Amount</Th>
          </tr>
          <tr className="border-b border-gray-300 text-gray-500">
            <Th></Th>
            {showSa && <Th></Th>}
            <Th></Th>
            <Th></Th>
            <Th className="text-right">NOS</Th>
            <Th className="text-right">{rateLabel}</Th>
            <Th className="text-right">{rateLabel}</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id ?? item.sr_no} className="border-b border-gray-200">
              <Td className="text-center align-top">{item.sr_no}</Td>
              {showSa && <Td className="align-top">{item.sa_number}</Td>}
              <Td className="align-top">{item.part_number}</Td>
              <Td className="align-top">{item.description}</Td>
              <Td className="text-right align-top">{fmtAmount(item.quantity, 0)}</Td>
              <Td className="text-right align-top">{fmtAmount(item.unit_price, 3)}</Td>
              <Td className="text-right align-top">{fmtAmount(item.total_amount)}</Td>
            </tr>
          ))}
          <tr className="border-t border-black font-bold bg-slate-50">
            <Td colSpan={showSa ? 4 : 3} className="text-right pr-2">TOTAL</Td>
            <Td className="text-right">{fmtAmount(totalQty, 0)}</Td>
            <Td></Td>
            <Td className="text-right text-[12px] bg-indigo-100 border-r-0">{fmtAmount(totalAmt)}</Td>
          </tr>
        </tbody>
      </table>

      <div className="border-t border-b border-black p-2 text-[10px]">
        <span className="font-semibold">(IN WORDS)&nbsp;&nbsp;</span>
        {amountInWords(totalAmt, invoice.currency)}
      </div>

      {/* PACKING section */}
      <div className="px-2 pt-2 pb-1 border-b border-black bg-slate-50 font-semibold text-[10px] tracking-wide">
        PACKING LIST
      </div>
      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr className="border-b border-black">
            <Th className="w-[6%] text-center">Sr.</Th>
            <Th className="w-[34%]">Marks &amp; Nos</Th>
            <Th className="w-[14%]">No of Pkgs</Th>
            <Th className="w-[34%]">Dimensions</Th>
            <Th className="w-[12%]">Unit</Th>
          </tr>
        </thead>
        <tbody>
          {packingList.map((row, idx) => (
            <tr key={idx} className="border-b border-gray-200">
              <Td className="text-center align-top">{idx + 1}</Td>
              <Td className="align-top">{row.marks_nos}</Td>
              <Td className="align-top">{row.no_of_pkgs}</Td>
              <Td className="align-top">{row.dimensions}</Td>
              <Td className="align-top">{row.dimensions_unit}</Td>
            </tr>
          ))}
          <tr className="border-t border-black bg-slate-50 font-semibold">
            <Td colSpan={5} className="px-2">
              Net Weight: {invoice.net_weight} Kgs
            </Td>
          </tr>
          <tr className="bg-slate-50 font-semibold">
            <Td colSpan={5} className="px-2">
              Gross Weight: {invoice.gross_weight} Kgs
            </Td>
          </tr>
        </tbody>
      </table>

      <div className="p-2 flex justify-between gap-4 border-t border-black">
        <div className="text-[9px] text-gray-800 max-w-[58%]">
          <p>
            We declare that this invoice shows the actual price of the goods described and that all
            particulars are true and correct.
          </p>
          {company.lut_arn_no && (
            <p className="mt-2">
              Export under LUT ARN: {company.lut_arn_no}
              {company.lut_arn_date
                ? ` dated ${formatInvoiceDisplayDate(company.lut_arn_date)}`
                : ""}
            </p>
          )}
          <div className="mt-3 text-[10px]">
            <div>Place : {company.place}</div>
            <div>Date : {formatInvoiceDisplayDate(invoice.invoice_date)}</div>
          </div>
        </div>
        <div className="text-right text-[10px] shrink-0">
          <div className="font-bold">For {company.name}</div>
          <div className="mt-6 border-t border-gray-500 pt-0.5 min-w-[140px] inline-block text-left">
            Authorised Signatory
            {company.signatory_name && (
              <div className="text-[9px] block">({company.signatory_name})</div>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

function RefRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1 leading-tight">
      <span className="text-[9px] text-gray-600 shrink-0 w-[108px]">{label}</span>
      <span className="font-semibold">{value}</span>
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
    <div className={`flex ${last ? "" : "border-b border-black"}`}>
      <div className="w-1/2 border-r border-black p-1.5">
        {label && <div className="text-[9px] text-gray-600">{label}</div>}
        <div>{value}</div>
      </div>
      <div className="w-1/2 p-1.5">
        {label2 && <div className="text-[9px] text-gray-600">{label2}</div>}
        <div>{value2}</div>
      </div>
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`border border-black p-1 font-semibold text-left ${className ?? ""}`}>
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
