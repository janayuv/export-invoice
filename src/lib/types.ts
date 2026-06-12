export type InvoiceStatus = "draft" | "final";
export type Currency = "USD" | "EUR" | "GBP" | "AED" | "INR";
export type TransportMode = "BY SEA" | "BY AIR" | "BY ROAD" | "BY COURIER";

export interface CompanySettings {
  id: number;
  name: string;
  address: string;
  gstin: string;
  pan: string;
  iec: string;
  bank_name: string;
  bank_account: string;
  ifsc: string;
  swift: string;
  bank_ad_code: string;
  lut_arn_no: string;
  lut_arn_date: string;
  place: string;
  signatory_name: string;
  company_logo_base64: string;
  fiscal_year: string;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  invoice_date: string;
  transport_mode: TransportMode;
  buyer_order_no: string;
  duty_drawback: string;
  hs_code: string;
  other_references: string;
  consignee_name: string;
  consignee_address: string;
  buyer_if_other: string;
  country_of_origin: string;
  country_of_destination: string;
  pre_carriage_by: string;
  place_of_receipt: string;
  pre_carrier: string;
  vessel: string;
  port_of_loading: string;
  port_of_discharge: string;
  final_destination: string;
  terms_of_payment: string;
  incoterm: string;
  currency: Currency;
  exchange_rate: number;
  net_weight: string;
  gross_weight: string;
  notes: string;
  status: InvoiceStatus;
  row_version: number;
  show_sa_number: boolean;
  company_logo_base64?: string;
  purchase_order_id?: number | null;
  packing_list?: PackingListItem[];
  created_at: string;
  updated_at: string;
  items?: InvoiceItem[];
}

export interface InvoiceItem {
  id: number;
  invoice_id: number;
  sr_no: number;
  marks_nos: string;
  no_of_pkgs: string;
  dimensions: string;
  dimensions_unit: string;
  part_number: string;
  sa_number: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_amount: number;
}

export interface PackingListItem {
  sr_no: number;
  marks_nos: string;
  no_of_pkgs: string;
  dimensions: string;
  dimensions_unit: string;
  net_weight?: string;
  gross_weight?: string;
}

export type InvoiceFormValues = Omit<
  Invoice,
  "id" | "row_version" | "created_at" | "updated_at" | "items"
> & {
  items: Omit<InvoiceItem, "id" | "invoice_id">[];
  packing_list?: PackingListItem[];
};

// Line-item snapshot copied from the selected invoice when an entry is created.
export interface EntryItem {
  part_number: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_amount: number;
}

// Consolidated export entry (migrations 20–21). Optional links to a customer,
// invoice and PO, with denormalized snapshots of their key fields plus the
// manual export/shipping fields not captured by any existing module.
export interface Entry {
  id: number;
  customer_id: number | null;
  invoice_id: number | null;
  purchase_order_id: number | null;
  customer_name: string;
  customer_address: string;
  invoice_number: string;
  invoice_date: string;
  po_number: string;
  po_date: string;
  customer_po_no: string;
  currency: Currency;
  exchange_rate: number;
  invoice_total: number;
  local_invoice_no: string;
  local_invoice_date: string;
  shipping_bill_no: string;
  shipping_bill_date: string;
  bl_awb_no: string;
  bl_awb_date: string;
  vessel_flight_no: string;
  container_no: string;
  transport_mode: TransportMode;
  port_of_loading: string;
  port_of_discharge: string;
  final_destination: string;
  egm_no: string;
  egm_date: string;
  fob_value: number;
  freight: number;
  insurance: number;
  net_weight: string;
  gross_weight: string;
  no_of_packages: string;
  marks_nos: string;
  remarks: string;
  status: InvoiceStatus;
  row_version: number;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  items?: EntryItem[];
}

// The subset of fields the Entry form collects (selectors + auto-filled
// snapshots + manual export references). Unused export/shipping columns on the
// table fall back to their DB defaults.
export type EntryFormValues = {
  customer_id: number | null;
  invoice_id: number | null;
  purchase_order_id: number | null;
  customer_name: string;
  customer_address: string;
  invoice_number: string;
  invoice_date: string;
  po_number: string;
  po_date: string;
  customer_po_no: string;
  currency: Currency;
  exchange_rate: number;
  invoice_total: number;
  items: EntryItem[];
  local_invoice_no: string;
  local_invoice_date: string;
  shipping_bill_no: string;
  shipping_bill_date: string;
  bl_awb_no: string;
  bl_awb_date: string;
  status: InvoiceStatus;
};
