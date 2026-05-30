import { invoke } from "@tauri-apps/api/core";
import { getDb, setDbReadGate } from "@/lib/db";

export type UserRole = "admin" | "operator" | "viewer";

export interface User {
  id: number;
  name: string;
  role: UserRole;
  is_active: number;
  created_at: string;
  pin_hash_kind?: "argon2" | "legacy-sha256";
  /** DB-backed effective permission set, populated by verify_pin. Absent on DB-select paths. */
  permissions?: string[];
}

export interface UserWithHash extends User {
  pin_hash: string;
}

export async function getUsers(): Promise<User[]> {
  const db = await getDb();
  return db.select<User[]>(
    `SELECT
      id, name, role, is_active, created_at,
      CASE
        WHEN pin_hash LIKE '$argon2%' THEN 'argon2'
        ELSE 'legacy-sha256'
      END AS pin_hash_kind
     FROM users
     ORDER BY id`
  );
}

export async function getActiveUsers(): Promise<User[]> {
  const db = await getDb({ bypassGate: true });
  return db.select<User[]>(
    "SELECT id, name, role, is_active, created_at FROM users WHERE is_active=1 ORDER BY name"
  );
}

export type VerifyPinResult =
  | { status: "success"; user: User }
  | { status: "failed"; remaining_attempts: number }
  | { status: "locked"; until: string };

/**
 * Verifies the PIN via Rust (Argon2id). Returns a discriminated union:
 * success → user record, failed → attempts remaining, locked → lockout expiry.
 */
export async function verifyPin(userId: number, pin: string): Promise<VerifyPinResult> {
  const result = await invoke<VerifyPinResult>("verify_pin", { userId, pin });
  if (result.status === "success") {
    setDbReadGate(true);
  }
  return result;
}

/** Restores Rust AuthSession after browser reload when sessionStorage is still valid. */
export async function restoreSession(
  userId: number,
  sessionStartedMs: number,
  lastActivityMs: number,
): Promise<User> {
  const user = await invoke<User>("restore_session", {
    userId,
    sessionStartedMs,
    lastActivityMs,
  });
  setDbReadGate(true);
  return user;
}

/** Creates a new user; PIN is hashed with Argon2id in Rust. */
export async function createUser(
  name: string,
  pin: string,
  role: UserRole
): Promise<void> {
  await invoke("create_user_pin", { name, pin, role });
}

export async function updateUser(
  id: number,
  name: string,
  role: UserRole,
  isActive: boolean,
): Promise<void> {
  await invoke("update_user_info", { id, name, role, isActive });
}

export async function logout(): Promise<void> {
  await invoke("logout");
  setDbReadGate(false);
}

/** Replaces the user's PIN with a fresh Argon2id hash in Rust. */
export async function changePin(id: number, newPin: string): Promise<void> {
  await invoke("change_pin", { userId: id, newPin });
}

export async function userCount(): Promise<number> {
  const db = await getDb({ bypassGate: true });
  const rows = await db.select<{ c: number }[]>("SELECT COUNT(*) as c FROM users");
  return rows[0].c;
}

// Permissions matrix
export const PERMISSIONS = {
  view_invoices: ["admin", "operator", "viewer"],
  export_invoice: ["admin", "operator", "viewer"],
  create_invoice: ["admin", "operator"],
  edit_invoice: ["admin", "operator"],
  edit_final_invoice: ["admin"],
  edit_confirmed_po: ["admin"],
  finalize_invoice: ["admin"],
  delete_invoice: ["admin"],
  access_settings: ["admin"],
  manage_users: ["admin"],
  // Admin Center — defined for future fine-grained use; all routes currently gated by access_settings
  view_database_mgmt:     ["admin"],
  view_activity_log:      ["admin"],
  view_user_activity:     ["admin"],
  view_system_health:     ["admin"],
  view_security_center:   ["admin"],
  view_roles_permissions: ["admin"],
  view_automation:        ["admin"],
  view_operations:        ["admin"],
  view_system_agent:      ["admin"],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly string[]).includes(role);
}

/** Draft invoices: needs edit_invoice; finalized: needs edit_final_invoice. */
export function canEditInvoiceByStatus(
  permissions: string[],
  status: "draft" | "final"
): boolean {
  if (status === "draft") return permissions.includes("edit_invoice");
  return permissions.includes("edit_final_invoice");
}

/** Draft POs: needs edit_invoice; confirmed: needs edit_confirmed_po; closed: no one. */
export function canEditPurchaseOrderByStatus(
  permissions: string[],
  status: "draft" | "confirmed" | "closed"
): boolean {
  if (status === "draft") return permissions.includes("edit_invoice");
  if (status === "confirmed") return permissions.includes("edit_confirmed_po");
  return false;
}

// ── Role permissions ──────────────────────────────────────────────────────────

export interface RolePermissionRow {
  role: "operator" | "viewer";
  permission: string;
  granted: boolean;
}

/** Fetch the current permission matrix for operator and viewer roles. Admin-only. */
export async function getRolePermissions(): Promise<RolePermissionRow[]> {
  return invoke<RolePermissionRow[]>("get_role_permissions");
}

/** Upsert a single role+permission grant. Role must be operator or viewer. Admin-only. */
export async function setRolePermission(
  role: "operator" | "viewer",
  permission: string,
  granted: boolean
): Promise<void> {
  return invoke("set_role_permission", { payload: { role, permission, granted } });
}

export interface AuthAuditEntry {
  id: number;
  user_id: number | null;
  event_type: "failed_attempt" | "locked" | "unlocked" | "pin_changed" | "login_success";
  occurred_at: string;
  details_json: string;
}

export interface AuthTelemetry {
  failed_attempts: number;
  lock_events: number;
  unlock_events: number;
  login_successes: number;
  pin_changes: number;
}

export async function getAuthAuditLog(
  limit?: number,
  userId?: number,
): Promise<AuthAuditEntry[]> {
  return invoke<AuthAuditEntry[]>("get_auth_audit_log", {
    limit: limit ?? null,
    userId: userId ?? null,
  });
}

export async function getAuthTelemetryWindow(hours = 24): Promise<AuthTelemetry> {
  return invoke<AuthTelemetry>("get_auth_telemetry_window", { hours });
}

export interface CurrentSessionInfo {
  user_id: number;
  user_name: string;
  role: UserRole;
  logged_in_at: string;
  source: string;
}

export async function getCurrentSession(): Promise<CurrentSessionInfo> {
  return invoke<CurrentSessionInfo>("get_current_session");
}
