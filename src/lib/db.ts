import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import { exists, remove, writeTextFile } from "@tauri-apps/plugin-fs";
import { appConfigDir, join } from "@tauri-apps/api/path";

const DB_PATH_KEY = "db_path";
export const DEFAULT_DB_PATH = "export_invoice.db";

const SELECTION_FILE = "selected_db.txt";

let _db: Database | null = null;
/** v1.0 product rule: business-data reads require an active Rust AuthSession. */
let _readGateOpen = false;

export function setDbReadGate(open: boolean): void {
  _readGateOpen = open;
}

export function isDbReadGateOpen(): boolean {
  return _readGateOpen;
}

export type GetDbOptions = {
  /** Pre-auth routes only: login, setup, schema bootstrap. */
  bypassGate?: boolean;
};

async function selectionFilePath(): Promise<string> {
  return join(await appConfigDir(), SELECTION_FILE);
}

export function getStoredDbPath(): string | null {
  return localStorage.getItem(DB_PATH_KEY);
}

export function getDbPath(): string {
  return getStoredDbPath() ?? DEFAULT_DB_PATH;
}

export async function setDbPath(path: string): Promise<void> {
  await writeTextFile(await selectionFilePath(), path);
  localStorage.setItem(DB_PATH_KEY, path);
  _db = null;
}

export async function clearDbPath(): Promise<void> {
  const file = await selectionFilePath();
  if (await exists(file)) {
    await remove(file);
  }
  localStorage.removeItem(DB_PATH_KEY);
  _db = null;
}

export async function getDb(options?: GetDbOptions): Promise<Database> {
  if (!_readGateOpen && !options?.bypassGate) {
    throw new Error("ERR_SESSION: Database reads require an active session");
  }
  if (!_db) {
    _db = await Database.load(`sqlite:${getDbPath()}`);
  }
  return _db;
}

export async function withTransaction<T>(
  _db: Database,
  fn: () => Promise<T>
): Promise<T> {
  return fn();
}

const ADMIN_TABLES = [
  "activity_log",
  "system_agent_settings",
  "automation_tasks",
  "incidents",
] as const;

export async function validateSchema(): Promise<void> {
  await invoke("ensure_database_schema");

  const db = await getDb({ bypassGate: true });

  const checks: [string, string][] = [
    ["invoice_items", "sa_number"],
    ["invoices", "show_sa_number"],
    ["invoices", "packing_list"],
    ["purchase_orders", "show_sa_number"],
    ["purchase_order_items", "sa_number"],
  ];
  for (const [table, col] of checks) {
    const cols = await db.select<{ name: string }[]>(`PRAGMA table_info(${table})`);
    if (!cols.some((c) => c.name === col)) {
      console.error(`Schema guard: column ${table}.${col} missing — migrations may not have run.`);
    }
  }

  for (const table of ADMIN_TABLES) {
    const rows = await db.select<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name = $1",
      [table],
    );
    if (rows.length === 0) {
      console.error(
        `Schema guard: table ${table} missing — restart the app after updating, or re-open Settings → Database.`,
      );
    }
  }
}
