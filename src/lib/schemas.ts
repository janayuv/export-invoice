import { z } from "zod";

export const companySettingsSchema = z.object({
  name: z.string().min(1, "Company name is required"),
  address: z.string().min(1, "Address is required"),
  gstin: z.string(),
  pan: z.string(),
  iec: z.string(),
  bank_name: z.string(),
  bank_account: z.string(),
  ifsc: z.string(),
  swift: z.string(),
  bank_ad_code: z.string(),
  lut_arn_no: z.string(),
  lut_arn_date: z.string(),
  place: z.string(),
  signatory_name: z.string(),
});

export type CompanySettingsFormValues = z.infer<typeof companySettingsSchema>;

export const invoiceItemSchema = z.object({
  sr_no: z.number().int().positive(),
  marks_nos: z.string(),
  no_of_pkgs: z.string(),
  dimensions: z.string(),
  part_number: z.string(),
  description: z.string().min(1, "Description is required"),
  quantity: z.number().positive("Quantity must be positive"),
  unit: z.string().min(1, "Unit is required"),
  unit_price: z.number().nonnegative("Price cannot be negative"),
  total_amount: z.number().nonnegative(),
});

export const invoiceFormSchema = z.object({
  invoice_number: z.string().min(1, "Invoice number is required"),
  invoice_date: z.string().min(1, "Date is required"),
  transport_mode: z.enum(["BY SEA", "BY AIR", "BY ROAD"]),
  buyer_order_no: z.string(),
  duty_drawback: z.string(),
  hs_code: z.string(),
  other_references: z.string(),
  consignee_name: z.string().min(1, "Consignee name is required"),
  consignee_address: z.string().min(1, "Consignee address is required"),
  buyer_if_other: z.string(),
  country_of_origin: z.string(),
  country_of_destination: z.string(),
  pre_carriage_by: z.string(),
  place_of_receipt: z.string(),
  pre_carrier: z.string(),
  vessel: z.string(),
  port_of_loading: z.string(),
  port_of_discharge: z.string(),
  final_destination: z.string(),
  terms_of_payment: z.string(),
  currency: z.enum(["USD", "EUR", "GBP", "AED", "INR"]),
  exchange_rate: z.number().positive(),
  net_weight: z.string(),
  gross_weight: z.string(),
  notes: z.string(),
  status: z.enum(["draft", "final"]),
  items: z.array(invoiceItemSchema).min(1, "At least one item is required"),
});

export type InvoiceFormSchema = z.infer<typeof invoiceFormSchema>;
