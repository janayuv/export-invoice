import { z } from "zod";
import { LIMITS } from "@/lib/limits";

const str = (max: number) => z.string().max(max);
const reqStr = (max: number, msg: string) => z.string().min(1, msg).max(max);

export const companySettingsSchema = z.object({
  name: reqStr(LIMITS.NAME, "Company name is required"),
  address: reqStr(LIMITS.ADDRESS, "Address is required"),
  gstin: str(LIMITS.SHORT_TEXT),
  pan: str(LIMITS.SHORT_TEXT),
  iec: str(LIMITS.SHORT_TEXT),
  bank_name: str(LIMITS.MEDIUM_TEXT),
  bank_account: str(LIMITS.MEDIUM_TEXT),
  ifsc: str(LIMITS.SHORT_TEXT),
  swift: str(LIMITS.SHORT_TEXT),
  bank_ad_code: str(LIMITS.SHORT_TEXT),
  lut_arn_no: str(LIMITS.MEDIUM_TEXT),
  lut_arn_date: str(LIMITS.SHORT_TEXT),
  place: str(LIMITS.SHORT_TEXT),
  signatory_name: str(LIMITS.NAME),
  fiscal_year: str(LIMITS.SHORT_TEXT),
});

export type CompanySettingsFormValues = z.infer<typeof companySettingsSchema>;

export const packingListItemSchema = z.object({
  sr_no: z.number().int().positive(),
  marks_nos: str(LIMITS.MEDIUM_TEXT),
  no_of_pkgs: str(LIMITS.SHORT_TEXT),
  dimensions: str(LIMITS.MEDIUM_TEXT),
  dimensions_unit: str(LIMITS.UNIT),
  net_weight: str(LIMITS.SHORT_TEXT).optional(),
  gross_weight: str(LIMITS.SHORT_TEXT).optional(),
});

export const invoiceItemSchema = z.object({
  sr_no: z.number().int().positive(),
  marks_nos: str(LIMITS.MEDIUM_TEXT),
  no_of_pkgs: str(LIMITS.SHORT_TEXT),
  dimensions: str(LIMITS.MEDIUM_TEXT),
  dimensions_unit: str(LIMITS.UNIT),
  part_number: str(LIMITS.PART_NUMBER),
  sa_number: str(LIMITS.SA_NUMBER),
  description: reqStr(LIMITS.DESCRIPTION, "Description is required"),
  quantity: z.number().positive("Quantity must be positive"),
  unit: reqStr(LIMITS.UNIT, "Unit is required"),
  unit_price: z.number().nonnegative("Price cannot be negative"),
  total_amount: z.number().nonnegative(),
  included: z.boolean().optional(),
});

export const invoiceFormSchema = z.object({
  invoice_number: reqStr(LIMITS.INVOICE_NUMBER, "Invoice number is required"),
  invoice_date: z.string().min(1, "Date is required"),
  transport_mode: z.enum(["BY SEA", "BY AIR", "BY ROAD", "BY COURIER"]),
  buyer_order_no: str(LIMITS.MEDIUM_TEXT),
  duty_drawback: str(LIMITS.MEDIUM_TEXT),
  hs_code: str(LIMITS.SHORT_TEXT),
  other_references: str(LIMITS.LONG_TEXT),
  consignee_name: reqStr(LIMITS.NAME, "Consignee name is required"),
  consignee_address: reqStr(LIMITS.ADDRESS, "Consignee address is required"),
  buyer_if_other: str(LIMITS.ADDRESS),
  country_of_origin: str(LIMITS.SHORT_TEXT),
  country_of_destination: str(LIMITS.SHORT_TEXT),
  pre_carriage_by: str(LIMITS.MEDIUM_TEXT),
  place_of_receipt: str(LIMITS.MEDIUM_TEXT),
  pre_carrier: str(LIMITS.MEDIUM_TEXT),
  vessel: str(LIMITS.MEDIUM_TEXT),
  port_of_loading: str(LIMITS.MEDIUM_TEXT),
  port_of_discharge: str(LIMITS.MEDIUM_TEXT),
  final_destination: str(LIMITS.MEDIUM_TEXT),
  terms_of_payment: str(LIMITS.MEDIUM_TEXT),
  incoterm: str(LIMITS.SHORT_TEXT),
  currency: z.enum(["USD", "EUR", "GBP", "AED", "INR"]),
  exchange_rate: z.number().positive(),
  net_weight: str(LIMITS.SHORT_TEXT),
  gross_weight: str(LIMITS.SHORT_TEXT),
  notes: str(LIMITS.NOTES),
  status: z.enum(["draft", "final"]),
  show_sa_number: z.boolean().default(true),
  purchase_order_id: z.number().int().nullable().optional(),
  items: z
    .array(invoiceItemSchema)
    .min(1, "At least one item is required")
    .max(LIMITS.MAX_LINE_ITEMS),
  packing_list: z.array(packingListItemSchema).max(LIMITS.MAX_PACKING_ROWS).default([]),
});

export type InvoiceFormSchema = z.infer<typeof invoiceFormSchema>;

export const poItemSchema = z.object({
  sr_no: z.number().int().positive(),
  part_number: str(LIMITS.PART_NUMBER),
  sa_number: str(LIMITS.SA_NUMBER),
  description: reqStr(LIMITS.DESCRIPTION, "Description is required"),
  quantity: z.number().positive("Quantity must be positive"),
  unit: reqStr(LIMITS.UNIT, "Unit is required"),
  unit_price: z.number().nonnegative("Unit price cannot be negative"),
  total_amount: z.number().nonnegative(),
});

export const poFormSchema = z.object({
  po_number: reqStr(LIMITS.PO_NUMBER, "PO number is required"),
  po_date: z.string().min(1, "PO date is required"),
  customer_id: z.number().int().positive("Select a customer from the master list"),
  customer_name: reqStr(LIMITS.NAME, "Customer name is required"),
  customer_address: str(LIMITS.ADDRESS),
  customer_po_no: reqStr(LIMITS.MEDIUM_TEXT, "Customer PO number is required"),
  delivery_date: str(LIMITS.SHORT_TEXT),
  delivery_address: str(LIMITS.ADDRESS),
  port_of_discharge: str(LIMITS.MEDIUM_TEXT),
  final_destination: str(LIMITS.MEDIUM_TEXT),
  payment_terms: str(LIMITS.MEDIUM_TEXT),
  currency: z.enum(["INR", "USD", "EUR", "GBP", "AED"]),
  exchange_rate: z.number().positive(),
  notes: str(LIMITS.NOTES),
  status: z.enum(["draft", "confirmed", "closed"]),
  show_sa_number: z.boolean().default(true),
  created_by: z.number().nullable(),
  items: z
    .array(poItemSchema)
    .min(1, "At least one line item is required")
    .max(LIMITS.MAX_LINE_ITEMS),
});

export type POFormSchema = z.infer<typeof poFormSchema>;
