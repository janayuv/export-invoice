# Backup Encryption Audit

> Audit only — no code changed. Scope: Google Drive backup encryption in
> `src-tauri/src/commands/gdrive.rs`. Local (`commands/backup.rs`) `.db`
> backups are **not** encrypted and restore fine cross-machine; the problem is
> isolated to `.enc` Drive backups.

## 1. Current Architecture

### Cipher & file format
- Algorithm: **AES-256-GCM** (`aes-gcm` 0.10).
- On-disk / Drive blob layout: `[nonce 12B][ciphertext + 16B GCM auth tag]`.
- **No version byte, no salt, no header** — format is not self-describing, so a
  future scheme cannot be distinguished from the current one by inspecting bytes.
- File naming: backup written as `export_invoice_backup_<stamp>.db`, then the
  encrypted upload is suffixed `.enc`. The `.enc` suffix is the **only** signal
  the restore path uses to decide whether to decrypt
  (`file_name.ends_with(".enc")`, gdrive.rs:756).

### Key generation & storage
- `load_or_create_encryption_key()` (gdrive.rs:202):
  - Reads a base64 32-byte key from **Windows Credential Manager** via `keyring`
    v3 (`windows-native`), service `com.exportinvoice.app`, entry
    `gdrive_encrypt_key_v1` (constant `KEYRING_ENCRYPT_KEY`, gdrive.rs:47).
  - On first use (entry missing): generates 32 random bytes from `OsRng`, stores
    base64 in Credential Manager, returns it.
  - Validates length == 32, else `ERR_GDRIVE: stored encryption key has wrong length`.
- `encrypt_bytes()` (gdrive.rs:229): random 12-byte nonce per blob, prepends nonce.
- `decrypt_bytes()` (gdrive.rs:241): splits first 12 bytes as nonce; on AEAD
  failure returns the user-facing
  `ERR_GDRIVE: decryption failed — backup may be corrupted or was encrypted on a
  different machine (key mismatch)`.

### Backup creation flow (`gdrive_backup`, gdrive.rs:~649)
1. Admin-only (reads role from `AuthSession`, gdrive.rs:653).
2. `logic_backup_database` → temp `.db`; `logic_verify_backup` integrity + sha256.
3. Read temp bytes, delete temp.
4. `load_or_create_encryption_key()` → `encrypt_bytes()` → upload as `<name>.db.enc`.

### Restore flow (`gdrive_download_and_stage_restore`, gdrive.rs:717)
1. Admin-only.
2. Download Drive file by id.
3. If name ends `.enc`: `load_or_create_encryption_key()` → `decrypt_bytes()`.
   Else: use raw bytes (plain `.db`).
4. Write to `STAGED_RESTORE_FILE` in app config dir.
5. `logic_validate_and_stage_restore` records `pending_restore.txt`; applied on
   next startup by `apply_pending_restore` (backup.rs) *before* migrations.

### Callers of `load_or_create_encryption_key()`
Exactly two, both in gdrive.rs:
- **gdrive.rs:686** — encrypt before upload (backup path).
- **gdrive.rs:757** — decrypt after download (restore path).

## 2. Why Backups Are Machine-Bound

The AES key is **randomly generated per machine** and stored **only** in that
machine's Windows Credential Manager. It is never derived from any portable
secret and never exported. Therefore:

- PC-A encrypts with key K_A. PC-B has no K_A; first use on PC-B mints an
  unrelated K_B. AES-GCM auth-tag verification fails → `decryption failed`.
- The Google Drive feature's purpose (off-site restore to *another* PC) is
  defeated for `.enc` files. Only same-machine restore works.
- Credential Manager entries are also per-Windows-user and do not roam, so even
  the same physical machine fails after an OS reinstall / new user profile.

## 3. Security Risks

- **Availability / data-loss (highest impact):** the only copy of the key is in
  one machine's credential store. Machine loss, disk failure, OS reinstall, or
  user-profile change ⇒ all `.enc` backups become **permanently undecryptable**.
  A backup you cannot restore is not a backup.
- **No format versioning:** `[nonce][ct+tag]` has no version/magic byte. Rolling
  out a new scheme cannot cleanly coexist with old blobs — migration must lean on
  filename or length heuristics, which are fragile.
- **`.enc` detection by filename only:** trusting `ends_with(".enc")` means a
  renamed file silently changes decrypt behavior; not a vuln on its own but
  brittle.
- **Plain `.db` backups remain unencrypted** (local + legacy Drive). The UI
  already warns ("Backups are not encrypted"), but mixed encrypted/plain history
  on Drive is a confusing security posture.
- **Note (not a current bug):** AES-GCM with a fresh random 96-bit nonce per blob
  is fine here; volume is far below the GCM birthday-bound concern.

## 4. Backward-Compatibility Requirements

Any fix must keep these working:

1. **Existing `.enc` blobs on Drive** were made with the machine-local random key.
   A passphrase scheme **cannot** decrypt them. Old blobs are only recoverable on
   the **original machine** (where K is still in Credential Manager). Migration
   must NOT assume old blobs are convertible without that machine.
2. **Existing plain `.db` blobs** (no `.enc`) must keep restoring as raw bytes —
   the `ends_with(".enc")` branch already handles this; preserve it.
3. **Restore-detection must stay backward compatible:** new format needs a
   self-describing header (magic + version) so the restore path can choose:
   plain `.db` / legacy-`.enc` (machine key) / new-`.enc` (passphrase). Until a
   header exists, the machine-key path must remain as a fallback for legacy `.enc`.
4. **Startup restore ordering** (staged-restore-before-migrations, backup.rs)
   must not change; only the decrypt step changes.

## 5. Exact Files / Functions That Must Change

All in `src-tauri/src/commands/gdrive.rs` unless noted:

| Location | Change |
|---|---|
| `load_or_create_encryption_key()` (gdrive.rs:202) | Keep as **legacy** decrypt fallback; stop using for new backups. |
| `encrypt_bytes()` (gdrive.rs:229) | Emit new header `[magic][ver][salt 16B][nonce 12B][ct+tag]`; key = Argon2id(passphrase, salt). |
| `decrypt_bytes()` (gdrive.rs:241) | Branch on header: new → derive key from passphrase+salt; legacy (no header) → machine key fallback. |
| `gdrive_backup` encrypt call (gdrive.rs:686) | Pass passphrase-derived key; require passphrase param. |
| `gdrive_download_and_stage_restore` decrypt call (gdrive.rs:757) | Accept passphrase param; pick scheme via header. |
| Constants block (gdrive.rs:45–49) | Add magic/version consts; Argon2 params. |
| `Cargo.toml` | `argon2` 0.5 already present (PIN hashing); no new dep. `aes-gcm`/`keyring` unchanged. |
| Frontend `DatabaseManagement.tsx` + Drive backup/restore wrappers | Add passphrase prompt on backup + restore; thread through `invoke`. Re-check `lib.rs` handler list if any new command is added. |

## 6. Proposed Migration Strategy

**Goal:** portable, passphrase-derived encryption; preserve recovery of legacy
blobs on their origin machine.

1. **Self-describing format v2.** New blob:
   `EXIV` (4B magic) + `0x02` (version) + `salt 16B` + `nonce 12B` + `ct+tag`.
   Key = `Argon2id(passphrase, salt)` → 32 bytes (reuse existing argon2 dep).
2. **Backup path:** prompt admin for a backup passphrase (confirm twice), derive
   key, write v2 blob. Surface a clear "passphrase cannot be recovered" warning.
3. **Restore path — scheme detection by header:**
   - Starts with `EXIV\x02` → v2: prompt for passphrase, derive key, decrypt.
   - `.enc` without magic → **legacy**: try machine key
     (`load_or_create_encryption_key`). Succeeds only on origin machine; on
     failure show the existing cross-machine error plus guidance.
   - No `.enc` → plain `.db` raw bytes (unchanged).
4. **Recovery guidance for the current stuck file (no code):** the existing
   `.enc` was made with PC-A's machine key. Recover by either (a) restoring it on
   PC-A then re-backing-up under v2 with a passphrase, or (b) exporting the
   `gdrive_encrypt_key_v1` value from PC-A's Credential Manager to PC-B. Option
   (a) is safer.
5. **Optional hardening (later):** add a `key_check` field (encrypted constant) in
   the header so a wrong passphrase is reported as "wrong passphrase" distinctly
   from "corrupt file".

### Risks of the migration
- Users must remember the passphrase; lost passphrase = lost backup (document
  prominently in UI).
- Mixed-version history on Drive; restore UI should label each backup's scheme.
- Argon2id params (memory/time cost) must be fixed constants keyed by version, so
  future tuning bumps the version byte rather than breaking old blobs.
