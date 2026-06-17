# Backup Encryption V2 — Format Specification

> Design only. No production code changed. Source of truth for findings:
> [backup-encryption-audit.md](backup-encryption-audit.md). This spec defines a
> **portable** encrypted backup (V2) that replaces the machine-bound V1 `.enc`
> scheme while keeping V1 `.enc` and plain `.db` restores working.

## 0. Goals & Non-Goals

**Goals**
- Cross-machine restore: any PC + passphrase decrypts.
- AES-256-GCM, key = Argon2id(passphrase, random salt).
- Random salt + random nonce per backup.
- No plaintext ever uploaded to Google Drive.
- Backward compatible: V1 `.enc` (machine key) and plain `.db` still restore.
- Reuse the existing `argon2` 0.5 crate (already a dependency for PIN hashing).

**Non-Goals**
- Converting old V1 blobs to V2 automatically (impossible without the origin
  machine's key — see audit §4).
- Encrypting local `commands/backup.rs` `.db` files (out of scope; unchanged).
- Key escrow / passphrase recovery. Lost passphrase = lost backup, by design.

## 1. Cryptographic Parameters

| Parameter | Value | Notes |
|---|---|---|
| Cipher | AES-256-GCM | `aes-gcm` 0.10 (existing) |
| Key length | 32 bytes (256-bit) | output of KDF |
| KDF | Argon2id | `argon2` 0.5, `Algorithm::Argon2id`, `Version::V0x13` |
| Argon2 params (kdf_id `0x01`) | m=19456 KiB (19 MiB), t=2, p=1 | OWASP minimum profile; fixed-by-kdf_id |
| Salt | 16 bytes, random per backup | `OsRng` |
| Nonce | 12 bytes, random per backup | `OsRng`, AES-GCM standard |
| Auth tag | 16 bytes | appended by GCM to ciphertext |

KDF call (raw key, not PHC string):

```rust
// argon2 0.5 — raw 32-byte derivation (distinct from the PHC hash_password
// used for PINs in auth.rs).
let argon2 = Argon2::new(
    argon2::Algorithm::Argon2id,
    argon2::Version::V0x13,
    argon2::Params::new(19456, 2, 1, Some(32)).map_err(|e| e.to_string())?,
);
let mut key = [0u8; 32];
argon2
    .hash_password_into(passphrase.as_bytes(), &salt /* 16 raw bytes */, &mut key)
    .map_err(|e| e.to_string())?;
```

> Note: `hash_password_into` takes the **raw** salt bytes, not a `SaltString`.
> The 16-byte salt is stored verbatim in the header (§2), so derivation is
> reproducible on any machine from passphrase + file.

## 2. V2 Binary File Format

All multi-byte numeric fields little-endian. All fields fixed-size except ciphertext.

```
Offset  Size      Field           Value / Description
------  --------  --------------  -------------------------------------------
0       4         magic           ASCII "EXIV" = 0x45 0x58 0x49 0x56
4       1         version         0x02  (V2)
5       1         kdf_id          0x01  (Argon2id profile #1 = m19456/t2/p1)
6       2         reserved        0x00 0x00  (alignment / future flags)
8       16        salt            random, per backup
24      12        nonce           random, per backup
36      N         ciphertext+tag  AES-256-GCM(key, nonce, plaintext) || 16B tag
```

- **Header size:** 36 bytes fixed. **Minimum file size:** 36 + 16 (empty-plaintext
  tag) = 52 bytes.
- **`kdf_id`** decouples the KDF profile from the format version, so Argon2
  cost-tuning later adds a new `kdf_id` without a format-version bump. For V2 only
  `0x01` is defined.
- **AAD (Additional Authenticated Data):** bind the first 8 header bytes
  (`magic||version||kdf_id||reserved`) as GCM AAD. This authenticates version +
  KDF id, so tampering those bytes fails decryption. Salt + nonce are already
  implicitly bound (changing them changes key/keystream → tag fail).

```
plaintext  = raw SQLite .db bytes
aad        = bytes[0..8]                       // magic+version+kdf_id+reserved
key        = Argon2id(passphrase, salt, profile[kdf_id])
ct_and_tag = AES256GCM_encrypt(key, nonce, plaintext, aad)
file       = header(36B) || ct_and_tag
```

## 3. Versioning Strategy

- **`magic "EXIV"`** = positive identifier for the family. Any blob starting with
  these 4 bytes is an EXIV-encrypted backup.
- **`version` byte** governs the overall layout. `0x02` = this spec. Future
  layout changes increment it.
- **`kdf_id` byte** governs key derivation only. New Argon2 cost profiles add
  entries to a profile table without touching `version`.
- **Forward rule:** a reader seeing `version > known_max` MUST refuse with a clear
  "backup created by a newer app version — please upgrade" error, not guess.

## 4. Legacy V1 Detection Strategy

V1 has **no magic**: it is `[nonce 12B][ciphertext+tag]`, raw. Detection is by
**positive identification of V2**, falling back to V1:

1. If `.enc` bytes start with `EXIV` (4 bytes) **and** byte[4] is a known version
   → treat as **V2**.
2. Else if filename ends `.enc` → treat as **V1** (machine-key path). A genuine V1
   blob will not realistically collide with the magic: V1's first 4 bytes are the
   random nonce; P(nonce == ASCII `EXIV`) = 2⁻³², and even then V2 parsing fails
   downstream (bad version / short) and falls back.
3. Else (no `.enc`) → plain `.db`, raw bytes (unchanged).

> Hardening: require **both** magic AND a valid known `version` before committing
> to V2, so a freak nonce collision cannot misroute a V1 file.

## 5. Restore Flow Decision Tree

```
download bytes from Drive (file_name, raw)
│
├─ file_name ends with ".enc"?
│   │
│   ├─ YES → starts with magic "EXIV" AND version byte known?
│   │        │
│   │        ├─ YES (V2) ─────────────► prompt passphrase
│   │        │                          parse header (salt, nonce, kdf_id)
│   │        │                          key = Argon2id(passphrase, salt, profile)
│   │        │                          plaintext = AES-GCM decrypt(key, nonce, ct, aad)
│   │        │                          ├─ tag OK   → stage restore
│   │        │                          └─ tag FAIL → "wrong passphrase or corrupt file"
│   │        │
│   │        └─ NO (V1) ──────────────► key = load_or_create_encryption_key()  // machine key
│   │                                   plaintext = decrypt_bytes(key, bytes)   // [nonce][ct]
│   │                                   ├─ tag OK   → stage restore
│   │                                   └─ tag FAIL → existing cross-machine error
│   │                                                 + guidance (restore on origin PC)
│   │
│   └─ NO → plain ".db" → use raw bytes directly → stage restore  (unchanged)
│
└─ write staged file → logic_validate_and_stage_restore → applied next startup
```

## 6. Failure Modes

| Condition | Detection | User-facing message |
|---|---|---|
| Wrong passphrase (V2) | GCM tag mismatch | "Wrong passphrase or corrupted backup." (cannot cryptographically distinguish the two without a key-check field — see §8) |
| Corrupt / truncated V2 (< 52B or short ct) | length check before decrypt | "Backup file is incomplete or corrupted." |
| Tampered header (version/kdf_id flipped) | AAD-bound → tag mismatch | same as wrong passphrase |
| Unknown future version | `version > known_max` | "Backup created by a newer app version — please update." |
| Unknown `kdf_id` | not in profile table | "Unsupported key-derivation profile — please update." |
| V1 on a different machine | machine-key decrypt tag fail | existing: "...encrypted on a different machine (key mismatch)" + restore-on-origin guidance |
| Empty / too-short passphrase | validation before KDF | "Passphrase required (min 8 characters)." |
| Plain `.db` corrupt | downstream SQLite integrity check (`logic_validate_and_stage_restore`) | existing integrity error |

## 7. Migration Plan

Staged, no auto-conversion of V1 (impossible per audit §4).

1. **Add V2 alongside V1 (additive).** Implement V2 encrypt/decrypt + header
   parse. Keep `load_or_create_encryption_key` + `decrypt_bytes` strictly as the
   V1 **read** fallback. New backups → V2 only. V1 write path retired.
2. **Frontend passphrase prompts.** Backup: prompt + confirm passphrase (≥ 8
   chars), warn "cannot be recovered if lost." Restore: prompt passphrase only
   when the selected file is detected V2; V1/`.db` need no prompt.
3. **Label backups in the restore list.** Show scheme per file (V2 / V1-legacy /
   plain) so users know which need a passphrase and which are machine-bound.
4. **Recover the existing stuck file (operational, no code):** the current V1
   `.enc` is bound to the origin PC. Either (a) restore it on the origin PC, then
   create a fresh V2 backup with a passphrase; or (b) export
   `gdrive_encrypt_key_v1` from the origin PC's Windows Credential Manager to the
   target PC. Option (a) preferred.
5. **Deprecation window.** Keep V1 read support indefinitely (cheap, read-only).
   Optionally surface a one-time nudge to re-backup under V2.

### Exact change points (from audit §5, for the later implementation phase)
- `src-tauri/src/commands/gdrive.rs`: `encrypt_bytes` (emit V2 header),
  `decrypt_bytes` (header-aware branch), `gdrive_backup` (gdrive.rs:686, pass
  passphrase), `gdrive_download_and_stage_restore` (gdrive.rs:757, pass
  passphrase), constants block (magic/version/kdf profile).
- Frontend `src/admin/pages/DatabaseManagement.tsx` + Drive wrappers: passphrase
  UI, thread param through `invoke`. Re-check `lib.rs` handler registration if a
  command signature change requires a new command.
- `Cargo.toml`: no new dependency — `argon2` 0.5, `aes-gcm` 0.10, `keyring` 3
  already present.

## 8. Optional Hardening (future, not required for V2)

- **Key-check field:** store `AES-GCM(key, fixed_nonce, b"EXIV-OK")` in the header
  so a wrong passphrase is reported distinctly from a corrupt file. Would bump
  `version` to `0x03` when added.
- **Argon2 cost auto-tuning:** add `kdf_id = 0x02` with higher m/t once baseline
  hardware is known; old files keep decrypting via their stored `kdf_id`.
