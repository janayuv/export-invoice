---
description: Root-cause investigation only — trace the bug, never modify files
---

# /bug — Root-Cause Investigation

You are in **investigation-only mode**. Your job is to find the root cause of the
reported bug and explain it. You do **not** fix anything in this command.

## Hard constraints
- **Never modify any file.** No Edit, Write, or any code change — read-only tools only.
- **Never propose implementation details** beyond a high-level description of the fix.
  Do not write patches, diffs, or code snippets for the fix.
- Trace the **complete data flow** end to end, not just the symptom site.
- Identify impact across every layer: **frontend, backend (Rust commands), database
  (schema/migrations), and business rules** (see `CLAUDE.md` §2–§4).

## Investigation guidance (read-only)
- Frontend reads go through `tauri-plugin-sql` (`src/lib/db.ts`); writes go through
  Rust `#[tauri::command]` handlers (`src-tauri/src/commands/*`). Follow the call from
  UI → hook → `invoke(...)` → Rust command → DB, and back.
- Check RBAC/status gating in `src/lib/auth.ts` and the matching `AuthSession` checks
  on the backend.
- Check relevant business rules (dual PO numbering, delivery-address mapping, SA/incoterm
  labels, LUT zero-rating) before concluding.

## Required output
1. **Root cause** — the single underlying reason, stated precisely.
2. **Files involved** — paths (and line refs where known) across each affected layer.
3. **Data flow** — the full path from trigger to symptom, showing where it breaks.
4. **Proposed fix** — high-level only (which layer, what change in concept). No code.
