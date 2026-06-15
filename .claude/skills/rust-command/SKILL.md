---
name: rust-command
description: Scaffold a new Tauri #[tauri::command] in the correct commands/*.rs module with AuthSession RBAC, register it in lib.rs, and generate a typed TypeScript invoke() wrapper in the relevant frontend hook. Generates an inline Rust integration test. Arguments: describe the command to create.
---

# Rust Command Scaffolder

Use this skill to add a new backend command to the Export-Invoice Tauri app.
Arguments passed via $ARGUMENTS describe the command purpose.

## Security contract (never break these)

- Role and user identity come **only** from `State<'_, AuthSession>` via `session.get()`
- **Never** accept `role`, `user_id`, or any identity field as an IPC parameter
- All SQL values use `rusqlite::params![...]` placeholders — never string interpolation
- Privileged commands return `Err(...)` immediately if the session role is insufficient

## Step-by-step scaffold

### 1. Choose the right module

| Domain | File |
|--------|------|
| Invoices, line items | `src-tauri/src/commands/invoice.rs` |
| Purchase orders | `src-tauri/src/commands/purchase_order.rs` |
| Customers | `src-tauri/src/commands/customer.rs` |
| Entries (shipment entries) | `src-tauri/src/commands/entry.rs` |
| Company settings / logo | `src-tauri/src/commands/settings.rs` |
| Backup / restore | `src-tauri/src/commands/backup.rs` |
| Admin / RBAC / audit | `src-tauri/src/commands/admin.rs` |
| Auth / PIN / session | `src-tauri/src/commands/auth.rs` |

### 2. Define the payload struct (if needed)

```rust
// Payload structs live at the top of the module, before the logic functions.
// Derive serde::Deserialize (and Serialize if the frontend needs to read it back).
#[derive(Debug, serde::Deserialize)]
pub struct MyCommandPayload {
    pub field_one: String,
    pub field_two: Option<i64>,
    // ... add all fields the frontend will send
}
```

### 3. Write the logic function

```rust
// Pure logic function: takes &Connection directly so it can be unit-tested
// without the Tauri managed-state machinery.
// Parameters come from the caller (the #[tauri::command] wrapper), NOT from IPC.
pub fn logic_my_command(
    conn: &Connection,
    payload: &MyCommandPayload,
    acting_role: &str,            // from AuthSession — never from IPC
    permissions: &[String],       // from AuthSession — never from IPC
    session_user_id: Option<i64>, // for audit logging
) -> Result<ReturnType, String> {
    // ── RBAC check ───────────────────────────────────────────────────────────
    // Check the role from AuthSession, not from any parameter.
    // Replace "required_permission" with the actual permission key.
    if acting_role != "admin" && !permissions.iter().any(|p| p == "required_permission") {
        return Err("ERR_PERMISSION: required_permission not granted".into());
    }

    // ── DB work ──────────────────────────────────────────────────────────────
    // Always use rusqlite::params![...] — never string interpolation.
    conn.execute(
        "INSERT INTO my_table (col1, col2) VALUES (?1, ?2)",
        rusqlite::params![payload.field_one, payload.field_two],
    )
    .map_err(|e| e.to_string())?;

    // ── Return value ─────────────────────────────────────────────────────────
    // Return i64 for new row ID, () for void, or a struct for read queries.
    Ok(conn.last_insert_rowid())
}
```

### 4. Write the `#[tauri::command]` wrapper

```rust
// Role and identity are read from the server-side AuthSession — they are never
// accepted from the frontend IPC payload.

#[tauri::command]
pub fn my_command(
    db: State<'_, AppDb>,
    session: State<'_, AuthSession>,
    payload: MyCommandPayload, // only data, never role/user_id
) -> Result<ReturnType, String> {
    // session.get() returns Err if nobody is logged in — the command is blocked.
    let sess = session.get()?;
    db.with_conn(|conn| logic_my_command(
        conn,
        &payload,
        &sess.role,
        &sess.permissions,
        Some(sess.user_id),
    ))
}
```

### 5. Register in `lib.rs`

Open `src-tauri/src/lib.rs` and add the command to the `tauri::generate_handler!` list.
**A missing entry here is the most common cause of "command not found" errors.**

```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands ...
    commands::my_module::my_command,   // ← add this line
])
```

### 6. Add the TypeScript invoke wrapper

Add a typed wrapper in the appropriate hook under `src/hooks/`.
Never call `invoke` from a route component — always go through a hook.

```typescript
import { invoke } from "@tauri-apps/api/core";

// Match the snake_case command name from Rust exactly.
// Match field names to the Rust payload struct fields exactly.
export async function myCommand(params: {
  fieldOne: string;
  fieldTwo?: number;
}): Promise<number> {
  return invoke<number>("my_command", {
    payload: {
      field_one: params.fieldOne,   // camelCase → snake_case
      field_two: params.fieldTwo ?? null,
    },
  });
}
```

### 7. Add inline Rust tests

Tests go in a `#[cfg(test)] mod tests { ... }` block at the bottom of the module.

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    // Helper: open an in-memory DB and create only the tables this command touches.
    fn test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        conn.execute_batch(
            "CREATE TABLE my_table (
                id    INTEGER PRIMARY KEY AUTOINCREMENT,
                col1  TEXT    NOT NULL,
                col2  INTEGER
             );",
        )
        .unwrap();
        conn
    }

    #[test]
    fn my_command_succeeds_for_admin() {
        let conn = test_db();
        let payload = MyCommandPayload {
            field_one: "value".into(),
            field_two: Some(42),
        };
        // Admin role with empty permissions list — admin bypasses permission checks.
        let result = logic_my_command(&conn, &payload, "admin", &[], None);
        assert!(result.is_ok());
    }

    #[test]
    fn my_command_blocked_without_permission() {
        let conn = test_db();
        let payload = MyCommandPayload {
            field_one: "value".into(),
            field_two: None,
        };
        // Operator with no permissions — must be rejected.
        let result = logic_my_command(&conn, &payload, "operator", &[], None);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("ERR_PERMISSION"));
    }
}
```

Run with: `cargo test` (Rust) and `npm run test` (TypeScript).

---

## Example

**Input:** `rust-command add a "get_invoice_stats" command that returns total invoice count and total amount for the current fiscal year`

**Expected output:**

1. Payload struct (or none for a read-only query) in `commands/invoice.rs`
2. `logic_get_invoice_stats(conn, acting_role, permissions, session_user_id)` function
3. `#[tauri::command] pub fn get_invoice_stats(...)` wrapper
4. Entry `commands::invoice::get_invoice_stats` added to `generate_handler!` in `lib.rs`
5. `export async function getInvoiceStats(): Promise<InvoiceStats>` in `src/hooks/useInvoices.ts`
6. Two tests: admin succeeds, operator without permission blocked

---

## Checklist before marking done

- [ ] Payload struct defined (or confirmed unnecessary for read-only)
- [ ] Logic function takes `acting_role` and `permissions` — not from IPC
- [ ] `#[tauri::command]` wrapper calls `session.get()` first
- [ ] Command registered in `lib.rs` `generate_handler!`
- [ ] TypeScript wrapper in the correct hook (snake_case → camelCase field mapping)
- [ ] At least two tests: permission granted and permission denied
- [ ] No `unwrap()` / `expect()` outside of `#[cfg(test)]` test helpers
