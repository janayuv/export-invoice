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
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO customers (
      name, address, country_of_destination,
      port_of_discharge, final_destination, currency,
      pre_carriage_by, place_of_receipt, pre_carrier, port_of_loading
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      data.name.trim(), data.address, data.country_of_destination,
      data.port_of_discharge, data.final_destination, data.currency,
      data.pre_carriage_by, data.place_of_receipt,
      data.pre_carrier, data.port_of_loading,
    ]
  );
  return result.lastInsertId ?? 0;
}

export async function updateCustomer(id: number, data: CustomerFormData): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE customers SET
      name=$1, address=$2, country_of_destination=$3,
      port_of_discharge=$4, final_destination=$5, currency=$6,
      pre_carriage_by=$7, place_of_receipt=$8, pre_carrier=$9,
      port_of_loading=$10, updated_at=datetime('now')
    WHERE id=$11`,
    [
      data.name.trim(), data.address, data.country_of_destination,
      data.port_of_discharge, data.final_destination, data.currency,
      data.pre_carriage_by, data.place_of_receipt,
      data.pre_carrier, data.port_of_loading, id,
    ]
  );
}

export async function deleteCustomer(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM customers WHERE id = ?", [id]);
}
