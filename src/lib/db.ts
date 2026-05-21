import Database from "@tauri-apps/plugin-sql";
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
