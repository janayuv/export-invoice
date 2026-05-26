# Incident Playbook — Export Invoice

> Audience: administrator operating the desktop app on Windows.  
> All SQL examples use the SQLite CLI: `sqlite3 "<path-to-db>"`.

---

## Scenario 1 — Locked User Account

**Symptoms:** User sees "Account locked" on the login screen and cannot authenticate.

**Cause:** Five consecutive failed PIN attempts trigger a 15-minute lockout stored in `users.locked_until`.

### Resolution steps

1. Open **User Management** (admin login required on a separate account or device).
2. Find the locked user — the UI shows lock status and expiry time.
3. Click **Unlock** to clear `failed_attempts` and `locked_until`.

**Manual DB resolution** (if the UI is inaccessible):

```sql
UPDATE users
SET failed_attempts = 0, locked_until = NULL
WHERE name = '<username>';
```

4. Ask the user to set a new PIN immediately via **Change PIN** to prevent repeat lockouts.

**If all admin accounts are locked** and no UI access is possible:

```sql
UPDATE users
SET failed_attempts = 0, locked_until = NULL
WHERE role = 'admin';
```

Restart the app after any direct DB edit.

---

## Scenario 2 — Migration Failure

**Symptoms:** App launches to a blank screen, or stderr shows `Migration N (description) failed`. App may crash on startup.

**Cause:** A new version added a migration that conflicts with the existing schema (e.g., column already exists, unique-constraint violation during a data backfill).

### Resolution steps

1. **Identify the failing migration** — launch from a terminal to capture stderr:
   ```powershell
   cd "C:\Program Files\Export Invoice"
   ".\Export Invoice.exe"
   ```
   Note the migration version number and description in the error.

2. **Restore from pre-upgrade backup** (created automatically each startup):
   - Located alongside the active DB: `export_invoice.pre-upgrade.YYYY-MM-DD.db`
   - Use Settings → Data Backup & Restore → **Restore from Backup**, select the file, restart.

3. **If no pre-upgrade backup exists**, restore from a manual backup (Settings → Backup Now from the previous session).

4. **Downgrade the app** to the previous installer version while the migration bug is reported and fixed.

5. **Report** the migration number and current schema to the developer:
   ```sql
   SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name;
   ```

---

## Scenario 3 — DB Corruption Recovery

**Symptoms:** App crashes, data is missing, or SQLite returns `SQLITE_CORRUPT` / `file is not a database`.

**Cause:** Disk failure, power loss during a write, or copying the `.db` file while the app was running.

### Step 1 — Verify corruption

```sql
PRAGMA integrity_check;
```

If the output is not `ok`, the file is corrupt.

### Step 2 — Attempt WAL checkpoint recovery

```sql
PRAGMA wal_checkpoint(TRUNCATE);
PRAGMA integrity_check;
```

### Step 3 — Restore from backup

| Source | Location |
|---|---|
| Pre-upgrade backup | Same folder as active DB: `export_invoice.pre-upgrade.YYYY-MM-DD.db` |
| Manual backup | Wherever saved via Settings → Backup Now |

Use Settings → Data Backup & Restore → **Restore from Backup** and restart.

### Step 4 — Partial data recovery (last resort)

If no backup is available, dump readable rows:

```sql
.mode csv
.output recovered.csv
SELECT * FROM invoices;
SELECT * FROM invoice_items;
SELECT * FROM purchase_orders;
SELECT * FROM purchase_order_items;
SELECT * FROM customers;
```

Some rows may be unreadable if B-tree pages are damaged.

### Prevention

- Always use **Settings → Backup Now** before Windows updates or hardware changes.
- Store backups on a separate drive or network share.
- Never copy the `.db` file while the app is running — use the in-app Backup button.
