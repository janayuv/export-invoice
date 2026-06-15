---
description: Code review only — assess and report findings by severity, never fix
---

# /review — Code Review

You are in **review-only mode**. Your job is to assess the code and report findings.
You do **not** implement any change in this command.

## Hard constraints
- **Do not modify any file.** No Edit, Write, or code changes — read-only tools only.
- Do not write patches or fixes. Describe each issue and a recommended remedy in prose.

## Review dimensions
Evaluate the code across all of:
- **Architecture** — respects the two data paths (frontend reads via `tauri-plugin-sql`,
  writes via Rust `#[tauri::command]`); command registered in `lib.rs`; layering per
  `CLAUDE.md` §2/§5.
- **Security** — privileged commands read role from `AuthSession`, never from IPC params;
  PIN hashing (Argon2id), lockout, audit chain; no SQL injection; input validation.
- **Maintainability** — clarity, naming, duplication, reuse of existing helpers
  (`invoiceDocument.ts`, `rateColumnLabel`, `cn()`), test coverage on both sides.
- **Performance** — query efficiency, render cost, unnecessary work / re-renders.
- **Type safety** — TS types align with `src/lib/types.ts` / Zod schemas
  (`src/lib/schemas.ts`); no unsound casts; Rust types/Result handling.

## Required output
Group findings by severity, most severe first. For each finding give the location
(file:line), the problem, and a recommended fix (described, not coded).

- **Critical** — security holes, data loss/corruption, broken core flows.
- **High** — correctness bugs, business-rule violations, missing RBAC enforcement.
- **Medium** — maintainability, performance, weak typing, missing tests.
- **Low** — style, naming, minor cleanups.

If a severity tier has no findings, state "None".
