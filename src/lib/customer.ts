import { invoke } from "@tauri-apps/api/core";
import { getDb } from "@/lib/db";

export interface Customer {
  id: number;
  name: string;
  address: string;
  country_of_destination: string;
  port_of_discharge: string;
  final_destination: string;
  currency: string;
  pre_carriage_by: string;
  place_of_receipt: string;
  pre_carrier: string;
  port_of_loading: string;
  created_at: string;
}

export type CustomerFormData = Omit<Customer, "id" | "created_at">;

function normalizeCustomer(data: CustomerFormData): CustomerFormData {
  return {
    name: data.name.trim(),
    address: data.address.trim(),
    country_of_destination: data.country_of_destination.trim(),
    port_of_discharge: data.port_of_discharge.trim(),
    final_destination: data.final_destination.trim(),
    currency: data.currency.trim(),
    pre_carriage_by: data.pre_carriage_by.trim(),
    place_of_receipt: data.place_of_receipt.trim(),
    pre_carrier: data.pre_carrier.trim(),
    port_of_loading: data.port_of_loading.trim(),
  };
}

export async function getCustomers(): Promise<Customer[]> {
  const db = await getDb();
  return db.select<Customer[]>(
    "SELECT * FROM customers ORDER BY name COLLATE NOCASE"
  );
}

export async function getCustomer(id: number): Promise<Customer | null> {
  const db = await getDb();
  const rows = await db.select<Customer[]>(
    "SELECT * FROM customers WHERE id = ?",
    [id]
  );
  return rows[0] ?? null;
}

export async function createCustomer(data: CustomerFormData): Promise<number> {
  const payload = normalizeCustomer(data);
  return invoke<number>("create_customer", { payload });
}

export async function updateCustomer(id: number, data: CustomerFormData): Promise<void> {
  const payload = normalizeCustomer(data);
  await invoke("update_customer", { id, payload });
}

export async function deleteCustomer(id: number): Promise<void> {
  await invoke("delete_customer", { id });
}
