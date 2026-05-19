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

export const packingListItemSchema = z.object({
  sr_no: z.number().int().positive(),
  marks_nos: z.string(),
  no_of_pkgs: z.string(),
  dimensions: z.string(),
  dimensions_unit: z.string(),
  net_weight: z.string().optional(),
  gross_weight: z.string().optional(),
});

export const invoiceItemSchema = z.object({
  sr_no: z.number().int().positive(),
  marks_nos: z.string(),
  no_of_pkgs: z.string(),
  dimensions: z.string(),
  dimensions_unit: z.string(),
  part_number: z.string(),
  sa_number: z.string(),
  description: z.string().min(1, "Description is required"),
  quantity: z.number().positive("Quantity must be positive"),
  unit: z.string().min(1, "Unit is required"),
  unit_price: z.number().nonnegative("Price cannot be negative"),
  total_amount: z.number().nonnegative(),
  included: z.boolean().optional(),
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
  incoterm: z.string(),
  currency: z.enum(["USD", "EUR", "GBP", "AED", "INR"]),
  exchange_rate: z.number().positive(),
  net_weight: z.string(),
  gross_weight: z.string(),
  notes: z.string(),
  status: z.enum(["draft", "final"]),
  show_sa_number: z.boolean().default(true),
  purchase_order_id: z.number().int().nullable().optional(),
  items: z.array(invoiceItemSchema).min(1, "At least one item is required"),
  packing_list: z.array(packingListItemSchema).default([]),
});

export type InvoiceFormSchema = z.infer<typeof invoiceFormSchema>;

/** Line item as received on the customer's purchase order. */
export const poItemSchema = z.object({
  sr_no: z.number().int().positive(),
  part_number: z.string(),
  sa_number: z.string(),
  description: z.string().min(1, "Description is required"),
  quantity: z.number().positive("Quantity must be positive"),
  unit: z.string().min(1, "Unit is required"),
  unit_price: z.number().nonnegative("Unit price cannot be negative"),
  total_amount: z.number().nonnegative(),
});

/** Header + items for purchase orders tied to a customer master record. */
export const poFormSchema = z.object({
  po_number: z.string().min(1),
  po_date: z.string().min(1, "PO date is required"),
  customer_id: z
    .number()
    .int()
    .positive("Select a customer from the master list"),
  customer_name: z.string().min(1, "Customer name is required"),
  customer_address: z.string(),
  customer_po_no: z.string().min(1, "Customer PO number is required"),
  delivery_date: z.string(),
  delivery_address: z.string(),
  payment_terms: z.string(),
  currency: z.enum(["INR", "USD", "EUR", "GBP", "AED"]),
  exchange_rate: z.number().positive(),
  notes: z.string(),
  status: z.enum(["draft", "confirmed", "closed"]),
  show_sa_number: z.boolean().default(true),
  created_by: z.number().nullable(),
  items: z.array(poItemSchema).min(1, "At least one line item is required"),
});

export type POFormSchema = z.infer<typeof poFormSchema>;
