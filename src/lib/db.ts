import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import { exists, remove, writeTextFile } from "@tauri-apps/plugin-fs";
import { appConfigDir, join } from "@tauri-apps/api/path";

const DB_PATH_KEY = "db_path";
export const DEFAULT_DB_PATH = "export_invoice.db";

// Selection file mirrored for the Rust side: it reads this at startup to register
// migrations for the chosen DB (see src-tauri/src/lib.rs `SELECTION_FILE`). It lives
// in the app config dir (%APPDATA%/com.exportinvoice.app on Windows) — the same dir
// Tauri resolves appConfigDir() and the default sqlite DB to, so both sides agree.
const SELECTION_FILE = "selected_db.txt";

let _db: Database | null = null;

async function selectionFilePath(): Promise<string> {
  return join(await appConfigDir(), SELECTION_FILE);
}

// Absolute path the user picked, or null when running on the default DB.
export function getStoredDbPath(): string | null {
  return localStorage.getItem(DB_PATH_KEY);
}

// Path actually handed to the SQL plugin — falls back to the bundled default.
export function getDbPath(): string {
  return getStoredDbPath() ?? DEFAULT_DB_PATH;
}

export async function setDbPath(path: string): Promise<void> {
  // Mirror the exact same absolute path into the file the Rust side reads FIRST,
  // so its migration registration key matches the connection string getDb() will
  // load. Doing the fallible FS write before touching localStorage guarantees the
  // two persistence layers never diverge: if the write fails, localStorage stays
  // unchanged and the app keeps pointing at the previous (registered) DB.
  await writeTextFile(await selectionFilePath(), path);
  localStorage.setItem(DB_PATH_KEY, path);
  _db = null; // drop the cached connection so the next getDb() reconnects
}

export async function clearDbPath(): Promise<void> {
  // Remove the selection file before clearing localStorage, for the same reason:
  // a failed removal must not leave the frontend on the default while the Rust
  // side still registers (and migrates) the previously selected DB.
  const file = await selectionFilePath();
  if (await exists(file)) {
    await remove(file);
  }
  localStorage.removeItem(DB_PATH_KEY);
  _db = null;
}

export async function getDb(): Promise<Database> {
  if (!_db) {
    _db = await Database.load(`sqlite:${getDbPath()}`);
  }
  return _db;
}

/**
 * NOT USED — kept for reference only.
 *
 * tauri-plugin-sql v2 uses a SQLx connection pool. Each call to
 * db.execute() / db.select() independently acquires a connection from
 * the pool and releases it when the await resolves. There is no
 * connection-affinity guarantee across calls, so BEGIN issued on one
 * connection may be paired with a COMMIT on a different connection,
 * producing either SQLITE_BUSY (code 5, "database is locked") or
 * SQLITE_ERROR (code 1, "cannot commit – no transaction is active").
 *
 * True multi-statement atomicity requires a Rust-side Tauri command
 * that calls pool.begin() and holds the Transaction object across all
 * writes. The JS hooks below use sequential direct calls instead,
 * which matches the original pre-Sprint-1 behaviour that worked.
 */
export async function withTransaction<T>(
  _db: Database,
  fn: () => Promise<T>
): Promise<T> {
  // Falls through to a direct call — no BEGIN/COMMIT wrapper.
  return fn();
}

/**
 * Verifies that columns added by migrations 15–17 are present.
 * Logs errors to the console — does not block the UI.
 * Call once at app startup.
 */
const ADMIN_TABLES = [
  "activity_log",
  "system_agent_settings",
  "automation_tasks",
  "incidents",
] as const;

export async function validateSchema(): Promise<void> {
  // Rust path: ensure admin tables + any pending plugin migrations on the active DB file.
  await invoke("ensure_database_schema");

  const db = await getDb();

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
