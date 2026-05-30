# Security Runbook — Export Invoice

> Audience: administrator operating the desktop app on Windows.  
> All SQL examples use the SQLite CLI: `sqlite3 "<path-to-db>"`.

---

## Overview of Security Logs

The app writes to two append-only tables. Neither is ever updated or deleted by application code.

| Table | What it records |
|---|---|
| `auth_audit_log` | Authentication events: login success/failure, lockout, unlock, PIN change |
| `security_event_log` | Backend-denied IPC commands (permission violations reaching Rust) |

Both tables have a timestamp index (`occurred_at DESC`). `auth_audit_log` rows are SHA-256 hash-chained starting from migration 25 — tampering with any row breaks the chain.

---

## Scenario 1 — Suspicious Login Attempts

**Symptoms:** A user reports seeing a "remaining attempts" warning they did not trigger, or an account was locked without the legitimate user failing any PINs.

### Step 1 — Find recent failures for the affected user

```sql
SELECT
    a.id,
    u.name          AS user_name,
    a.event_type,
    a.occurred_at,
    a.details_json
FROM auth_audit_log a
LEFT JOIN users u ON a.user_id = u.id
WHERE a.event_type IN ('failed_attempt', 'locked')
ORDER BY a.occurred_at DESC
LIMIT 50;
```

Look for:
- Multiple `failed_attempt` rows in a short window (< 1 minute) — indicates brute-force or scripted guessing.
- `locked` event not preceded by failed attempts from the same session — indicates database tampering.

### Step 2 — Check whether the hash chain is intact

```sql
SELECT
    id,
    event_type,
    occurred_at,
    prev_hash,
    entry_hash
FROM auth_audit_log
ORDER BY id;
```

Rows with non-empty `entry_hash` should chain: each row's `prev_hash` must equal the previous row's `entry_hash`. A mismatch means a row was inserted out of order, deleted, or modified after the fact.

**Flag for escalation** if any row has `entry_hash = ''` and there are newer rows with non-empty hashes — this indicates a row was retroactively inserted before chain coverage.

### Step 3 — Check IPC permission violations around the same time

```sql
SELECT
    s.id,
    s.command,
    s.user_id,
    u.name   AS user_name,
    s.reason,
    s.occurred_at
FROM security_event_log s
LEFT JOIN users u ON s.user_id = u.id
ORDER BY s.occurred_at DESC
LIMIT 50;
```

Legitimate usage produces zero rows in `security_event_log`. Any row means application code called a Rust command without the required role. Patterns to flag:

| Pattern | Meaning |
|---|---|
| Many rows from the same `user_id` | Viewer or operator account invoking admin commands |
| Rows with `user_id = NULL` | Command invoked without an active session |
| `ERR_PERMISSION: delete_` prefix in `reason` | Deletion attempt by a non-admin role |
| `ERR_PERMISSION: finalize_` prefix | Finalization attempt by non-admin |

### Step 4 — Correlate with successful logins

```sql
SELECT
    a.occurred_at,
    u.name          AS user_name,
    a.event_type,
    a.details_json
FROM auth_audit_log a
LEFT JOIN users u ON a.user_id = u.id
WHERE a.event_type = 'login_success'
ORDER BY a.occurred_at DESC
LIMIT 20;
```

If `security_event_log` shows violations from a `user_id` but `auth_audit_log` shows no `login_success` for that user ID in the same window, the session may have been forged or replayed.

---

## Scenario 2 — Unexpected Admin Activity

**Symptoms:** A record was created, updated, or deleted that no legitimate admin claims to have performed.

### Step 1 — Find recent security events by command type

```sql
SELECT command, COUNT(*) AS n, MIN(occurred_at), MAX(occurred_at)
FROM security_event_log
GROUP BY command
ORDER BY n DESC;
```

### Step 2 — Check who was logged in during the window

```sql
SELECT
    u.name,
    a.event_type,
    a.occurred_at
FROM auth_audit_log a
JOIN users u ON a.user_id = u.id
WHERE a.occurred_at BETWEEN '<start-ISO>' AND '<end-ISO>'
ORDER BY a.occurred_at;
```

Replace `<start-ISO>` / `<end-ISO>` with the suspected time range (e.g., `'2025-06-01 09:00:00'` and `'2025-06-01 09:30:00'`).

### Step 3 — Review PIN changes

```sql
SELECT
    u.name,
    a.occurred_at,
    a.details_json
FROM auth_audit_log a
JOIN users u ON a.user_id = u.id
WHERE a.event_type = 'pin_changed'
ORDER BY a.occurred_at DESC;
```

An unexpected `pin_changed` event may indicate account takeover.

---

## Scenario 3 — Verifying Log Integrity

Run this to confirm the hash chain has not been tampered with:

```sql
SELECT
    id,
    event_type,
    occurred_at,
    CASE WHEN entry_hash = '' THEN 'pre-chain (legacy)'
         ELSE 'chained'
    END AS chain_status
FROM auth_audit_log
ORDER BY id;
```

All rows after the first chained row should remain `'chained'`. A `'pre-chain (legacy)'` row appearing after chained rows is a red flag.

---

## Escalation Checklist

If any of the following are true, treat the incident as a potential security breach:

- [ ] Hash chain broken (row deleted or modified post-write)
- [ ] `security_event_log` rows with `user_id = NULL` (unauthenticated command calls)
- [ ] `login_success` for a user who was not physically present
- [ ] `pin_changed` event with no corresponding admin action
- [ ] More than 4 `failed_attempt` rows in < 60 seconds for any account

**Immediate actions:**

1. Lock all non-essential accounts:
   ```sql
   UPDATE users
   SET locked_until = datetime('now', '+24 hours')
   WHERE role != 'admin';
   ```
2. Change all admin PINs via **User Management → Change PIN**.
3. Take a backup immediately (**Settings → Backup Now**) to preserve the current log state.
4. Export both log tables to CSV for offline review:
   ```sql
   .mode csv
   .output auth_audit.csv
   SELECT * FROM auth_audit_log ORDER BY id;
   .output security_events.csv
   SELECT * FROM security_event_log ORDER BY id;
   .output stdout
   ```
5. Report the incident to the application developer with the exported CSVs.

---

## Session model and read gating (v1.0 product rule)

**v1.0 cannot ship without read gating.** Business-data SQL reads through the frontend plugin are blocked until a Rust `AuthSession` exists.

| Topic | Behavior |
|---|---|
| Login | Successful `verify_pin` establishes `AuthSession` and opens the read gate |
| Reload | `restore_session` repopulates `AuthSession` when browser `sessionStorage` is within 30-minute idle and 8-hour absolute limits |
| Logout | Clears `AuthSession` and closes the read gate |
| Pre-auth exceptions | Login screen user list, first-run setup (`users` empty), and schema bootstrap only |

Unauthenticated read of invoice/PO/customer data is **not supported** in v1.0.

### PIN command policy

| Command | Rule |
|---|---|
| `create_user_pin` | Allowed without session only when `users` table is empty (first-run setup); otherwise requires admin/`manage_users` |
| `change_pin` | Requires active session; user may change own PIN; admin may change any user's PIN |

### Admin IPC

All Admin Center commands require an **admin** `AuthSession` via `require_admin_session`, except `ensure_database_schema` (startup migration bootstrap only).
