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
  "id" | "created_at" | "updated_at" | "items"
> & {
  items: Omit<InvoiceItem, "id" | "invoice_id">[];
  packing_list?: PackingListItem[];
};
