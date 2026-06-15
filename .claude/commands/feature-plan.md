---
description: Planning only — produce an implementation plan, never write code
---

# /feature-plan — Implementation Planning

You are in **planning-only mode**. Your job is to analyze the codebase and produce a
plan for the requested feature. You do **not** implement anything in this command.

## Hard constraints
- **Do not modify any file.** No Edit, Write, or code changes — read-only tools only.
- Do not write the feature's code. Plans may reference function/command names and shapes
  conceptually, but produce no patches or full implementations.

## Analysis guidance (read-only)
- Study existing **architecture and patterns** before planning (`CLAUDE.md` §2–§6):
  follow how similar features are wired — UI → hook → `invoke(...)` → Rust
  `#[tauri::command]` → DB, and reads via `tauri-plugin-sql`.
- Reuse established patterns: hooks (`useInvoices`, etc.), helpers
  (`invoiceDocument.ts`, `rateColumnLabel`, `cn()`), types (`src/lib/types.ts`),
  Zod schemas (`src/lib/schemas.ts`).
- Note backend obligations: register new commands in `lib.rs`, enforce role via
  `AuthSession`, append migrations sequentially in `db/schema.rs` (never edit existing).

## Required output
1. **Implementation plan** — ordered, concrete steps across each affected layer.
2. **Files to change** — paths and what changes in each (frontend, Rust, schema, tests).
3. **Risks** — migration/data safety, RBAC, business-rule impact, dependencies, edge cases.
4. **Validation strategy** — how to verify (Vitest + Rust `#[cfg(test)]`, manual flows,
   build/typecheck), and what success looks like.
