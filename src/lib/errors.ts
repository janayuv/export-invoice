/**
 * Maps backend `ERR_*` prefixes and SQLite error text to user-facing messages.
 */

const ERR_MESSAGES: Record<string, string> = {
  ERR_PERMISSION:
    "You do not have permission to perform this action. Sign in as an admin or ask your administrator.",
  ERR_VALIDATION: "Some fields are invalid. Check the form and try again.",
  ERR_CONFLICT:
    "This record was changed in another session. Reload the page and try again.",
  ERR_BACKUP: "Backup failed. Check the destination path and disk space.",
  ERR_VERIFY: "Backup verification failed. The file may be corrupt or incomplete.",
  ERR_RESTORE: "Restore could not be prepared. Check the backup file and try again.",
  ERR_INTEGRITY: "Database integrity check failed. Use a backup or contact support.",
  ERR_LOG: "Application log could not be read.",
};

const SQLITE_MESSAGES: [RegExp, string][] = [
  [/malformed|disk image malformed|code:\s*11\b/i, "The database file appears corrupted."],
  [/database is locked|code:\s*5\b/i, "The database is busy. Wait a moment and try again."],
  [/UNIQUE constraint|code:\s*19\b|code:\s*2067\b/i, "A record with this value already exists."],
  [/FOREIGN KEY constraint|code:\s*19\b/i, "This record is linked to other data and cannot be changed this way."],
  [/no such table|code:\s*1\b/i, "The database schema is out of date. Restart the app after a backup."],
  [/unable to open database|code:\s*14\b/i, "The database file could not be opened. Check the path in Settings."],
];

function parseErrCode(raw: string): string | null {
  const m = raw.match(/^ERR_([A-Z0-9_]+):/);
  return m ? `ERR_${m[1]}` : null;
}

function messageForSqlite(raw: string): string | null {
  for (const [pattern, message] of SQLITE_MESSAGES) {
    if (pattern.test(raw)) return message;
  }
  return null;
}

/** Strip `ERR_CODE: ` prefix for display when no mapped message exists. */
export function stripErrPrefix(err: unknown): string {
  return String(err).replace(/^ERR_[A-Z0-9_]+:\s*/i, "");
}

/**
 * Returns a friendly message for toasts and error boundaries.
 * Falls back to the stripped backend message, then a generic line.
 */
export function userMessageFromError(err: unknown): string {
  const raw = String(err);
  const code = parseErrCode(raw);
  if (code && ERR_MESSAGES[code]) {
    return ERR_MESSAGES[code];
  }
  const sqlite = messageForSqlite(raw);
  if (sqlite) return sqlite;
  const stripped = stripErrPrefix(raw).trim();
  if (stripped) return stripped;
  return "Something went wrong. Try again or restart the app.";
}
