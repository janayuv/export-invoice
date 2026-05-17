import { getDb } from "@/lib/db";

export type UserRole = "admin" | "operator" | "viewer";

export interface User {
  id: number;
  name: string;
  role: UserRole;
  is_active: number;
  created_at: string;
}

export interface UserWithHash extends User {
  pin_hash: string;
}

export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getUsers(): Promise<User[]> {
  const db = await getDb();
  return db.select<User[]>(
    "SELECT id, name, role, is_active, created_at FROM users ORDER BY id"
  );
}

export async function getActiveUsers(): Promise<User[]> {
  const db = await getDb();
  return db.select<User[]>(
    "SELECT id, name, role, is_active, created_at FROM users WHERE is_active=1 ORDER BY name"
  );
}

export async function verifyPin(userId: number, pin: string): Promise<User | null> {
  const db = await getDb();
  const hash = await hashPin(pin);
  const rows = await db.select<User[]>(
    "SELECT id, name, role, is_active, created_at FROM users WHERE id=? AND pin_hash=? AND is_active=1",
    [userId, hash]
  );
  return rows[0] ?? null;
}

export async function createUser(
  name: string,
  pin: string,
  role: UserRole
): Promise<void> {
  const db = await getDb();
  const hash = await hashPin(pin);
  await db.execute(
    "INSERT INTO users (name, pin_hash, role) VALUES (?, ?, ?)",
    [name.trim(), hash, role]
  );
}

export async function updateUser(
  id: number,
  name: string,
  role: UserRole,
  isActive: boolean
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE users SET name=?, role=?, is_active=?, updated_at=datetime('now') WHERE id=?",
    [name.trim(), role, isActive ? 1 : 0, id]
  );
}

export async function changePin(id: number, newPin: string): Promise<void> {
  const db = await getDb();
  const hash = await hashPin(newPin);
  await db.execute(
    "UPDATE users SET pin_hash=?, updated_at=datetime('now') WHERE id=?",
    [hash, id]
  );
}

export async function userCount(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ c: number }[]>("SELECT COUNT(*) as c FROM users");
  return rows[0].c;
}

// Permissions matrix
export const PERMISSIONS = {
  view_invoices: ["admin", "operator", "viewer"],
  export_invoice: ["admin", "operator", "viewer"],
  create_invoice: ["admin", "operator"],
  edit_invoice: ["admin", "operator"],
  finalize_invoice: ["admin"],
  delete_invoice: ["admin"],
  access_settings: ["admin"],
  manage_users: ["admin"],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly string[]).includes(role);
}
