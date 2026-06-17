//! Google Drive backup integration.
//!
//! Uses OAuth 2.0 Authorization Code + PKCE (RFC 7636) with a loopback redirect
//! (127.0.0.1 on a random OS-assigned port). No client secret is required for
//! PKCE, but one may optionally be stored and included in token exchanges.
//!
//! # Setup (admin configures once inside the app)
//! 1. Google Cloud Console → APIs & Services → Credentials → Create OAuth 2.0 Client ID
//! 2. Application type: **Desktop app**
//! 3. Enable the Google Drive API for the project
//! 4. Copy the Client ID (and optionally the Client Secret)
//! 5. In Export Invoice → Admin → Database → Backup → Google Drive → enter the credentials
//!
//! Config file: %APPDATA%\com.exportinvoice.app\gdrive_oauth.json
//! Token storage: Windows Credential Manager via the `keyring` crate.
//! All HTTP calls are made in Rust (ureq) — the WebView CSP is unaffected.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write as IoWrite};
use std::net::TcpListener;
use std::path::PathBuf;

use aes_gcm::aead::{Aead, AeadCore, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD}, Engine as _};
use rand_core::{OsRng, RngCore};
use sha2::{Digest, Sha256};
use tauri::State;

use crate::db::state::{app_config_dir, AppDb, AuthSession};

// ── Constants ─────────────────────────────────────────────────────────────────

const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const REVOKE_URL: &str = "https://oauth2.googleapis.com/revoke";
const USERINFO_URL: &str = "https://openidconnect.googleapis.com/v1/userinfo";
const DRIVE_UPLOAD_URL: &str =
    "https://www.googleapis.com/upload/drive/v3/files\
    ?uploadType=multipart&fields=id,name,webViewLink";
const DRIVE_FILES_URL: &str = "https://www.googleapis.com/drive/v3/files";

const SCOPE: &str = "https://www.googleapis.com/auth/drive.file openid email";

const KEYRING_SERVICE: &str = "com.exportinvoice.app";
const KEYRING_USER: &str = "gdrive_tokens_v1";
const KEYRING_ENCRYPT_KEY: &str = "gdrive_encrypt_key_v1";
const OAUTH_CONFIG_FILE: &str = "gdrive_oauth.json";

// ── Backup format V2 constants ────────────────────────────────────────────────
//
// V2 header layout (36 bytes fixed), see docs/backup-encryption-v2-spec.md:
//   off 0  len 4   magic    b"EXIV"
//   off 4  len 1   version  0x02
//   off 5  len 1   kdf_id   0x01 (Argon2id, m=19456 t=2 p=1)
//   off 6  len 2   reserved 0x00 0x00
//   off 8  len 16  salt     random per backup
//   off 24 len 12  nonce    random per backup
//   off 36 ..      ciphertext+tag  AES-256-GCM(key, nonce, plaintext, aad)
// AAD = header bytes[0..8] (magic||version||kdf_id||reserved) — authenticates the
// version/kdf so tampering those bytes fails decryption.
const BACKUP_MAGIC: &[u8; 4] = b"EXIV";
const BACKUP_VERSION_V2: u8 = 0x02;
const KDF_ID_ARGON2ID_1: u8 = 0x01;
const V2_HEADER_LEN: usize = 36;
const V2_SALT_LEN: usize = 16;
const V2_NONCE_LEN: usize = 12;
const V2_AAD_LEN: usize = 8;

// Argon2id profile #1 (kdf_id 0x01). Fixed by kdf_id so future cost tuning bumps
// kdf_id rather than breaking old blobs. m=19456 KiB (~19 MiB), t=2, p=1.
const ARGON2_M_COST: u32 = 19456;
const ARGON2_T_COST: u32 = 2;
const ARGON2_P_COST: u32 = 1;

// Minimum backup passphrase length. Enforced on the backend (here) and mirrored
// in the UI. A lost passphrase means an unrecoverable backup, so this is a floor
// against trivially weak passphrases, not a substitute for user judgement.
const MIN_BACKUP_PASSPHRASE_LEN: usize = 8;
const OAUTH_TIMEOUT_SECS: u64 = 300;

// ── OAuth configuration (stored on disk, admin-managed) ───────────────────────

#[derive(Debug, Default, serde::Serialize, serde::Deserialize, Clone)]
pub struct OAuthConfig {
    pub client_id: String,
    /// Optional — PKCE alone is sufficient for Desktop app clients, but
    /// Google still issues a secret and some setups require it.
    pub client_secret: String,
}

/// Returned to the frontend — never exposes the raw secret value.
#[derive(Debug, serde::Serialize)]
pub struct OAuthConfigStatus {
    pub client_id: String,
    pub has_secret: bool,
}

fn config_file_path() -> Option<PathBuf> {
    app_config_dir().map(|d| d.join(OAUTH_CONFIG_FILE))
}

pub fn load_oauth_config() -> Result<OAuthConfig, String> {
    // Fall back to compile-time env var so CI/build-time usage still works.
    let env_id = option_env!("GOOGLE_OAUTH_CLIENT_ID").unwrap_or("").to_string();

    let path = config_file_path()
        .ok_or("ERR_GDRIVE: cannot determine app config directory")?;

    if path.exists() {
        let json = std::fs::read_to_string(&path)
            .map_err(|e| format!("ERR_GDRIVE: read oauth config: {e}"))?;
        let mut cfg: OAuthConfig = serde_json::from_str(&json)
            .map_err(|e| format!("ERR_GDRIVE: parse oauth config: {e}"))?;
        // If file has no client_id, fall back to env var.
        if cfg.client_id.trim().is_empty() && !env_id.is_empty() {
            cfg.client_id = env_id;
        }
        return Ok(cfg);
    }

    if !env_id.is_empty() {
        return Ok(OAuthConfig { client_id: env_id, client_secret: String::new() });
    }

    Err(
        "ERR_CONFIG: Google OAuth credentials not configured. \
        Go to Admin → Database → Backup → Google Drive and enter your Client ID."
            .to_string(),
    )
}

fn save_oauth_config_to_disk(cfg: &OAuthConfig) -> Result<(), String> {
    let path = config_file_path()
        .ok_or("ERR_GDRIVE: cannot determine app config directory")?;
    // Ensure the directory exists.
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("ERR_GDRIVE: create config dir: {e}"))?;
    }
    let json = serde_json::to_string_pretty(cfg)
        .map_err(|e| format!("ERR_GDRIVE: serialize oauth config: {e}"))?;
    std::fs::write(&path, json)
        .map_err(|e| format!("ERR_GDRIVE: write oauth config: {e}"))
}

// ── Stored token shape ────────────────────────────────────────────────────────

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
struct StoredTokens {
    access_token: String,
    refresh_token: String,
    expires_at: i64,
    email: String,
}

// ── Public return types ───────────────────────────────────────────────────────

#[derive(Debug, serde::Serialize)]
pub struct GDriveStatus {
    pub connected: bool,
    pub email: Option<String>,
}

#[derive(Debug, serde::Serialize)]
pub struct GDriveBackupResult {
    pub file_id: String,
    pub file_name: String,
    pub web_view_link: Option<String>,
    pub size_bytes: u64,
    pub sha256: String,
    pub integrity_ok: bool,
}

#[derive(Debug, serde::Serialize)]
pub struct GDriveFile {
    pub id: String,
    pub name: String,
    pub created_time: String,
    pub size_bytes: Option<String>,
    pub web_view_link: Option<String>,
}

// ── PKCE ──────────────────────────────────────────────────────────────────────

fn generate_pkce() -> (String, String) {
    let mut buf = [0u8; 64];
    OsRng.fill_bytes(&mut buf);
    let verifier = URL_SAFE_NO_PAD.encode(buf);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    (verifier, challenge)
}

fn generate_state() -> String {
    let mut buf = [0u8; 16];
    OsRng.fill_bytes(&mut buf);
    URL_SAFE_NO_PAD.encode(buf)
}

// ── Keyring (Windows Credential Manager) ─────────────────────────────────────

fn tokens_save(t: &StoredTokens) -> Result<(), String> {
    let json =
        serde_json::to_string(t).map_err(|e| format!("ERR_GDRIVE: serialize tokens: {e}"))?;
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("ERR_KEYRING: {e}"))?
        .set_password(&json)
        .map_err(|e| format!("ERR_KEYRING: save failed: {e}"))
}

fn tokens_load() -> Option<StoredTokens> {
    let json = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .ok()?
        .get_password()
        .ok()?;
    serde_json::from_str(&json).ok()
}

fn tokens_delete() -> Result<(), String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("ERR_KEYRING: {e}"))?
        .delete_credential()
        .map_err(|e| format!("ERR_KEYRING: delete failed: {e}"))
}

// ── Backup encryption (AES-256-GCM) ──────────────────────────────────────────
//
// A 256-bit key is generated on first use and stored in Windows Credential
// Manager under KEYRING_ENCRYPT_KEY. Encrypted blobs are prefixed with a
// 12-byte random nonce; the AES-GCM 16-byte auth tag is appended by the
// cipher. Format on disk/Drive: [nonce 12B][ciphertext+tag].

fn load_or_create_encryption_key() -> Result<[u8; 32], String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ENCRYPT_KEY)
        .map_err(|e| format!("ERR_KEYRING: {e}"))?;

    match entry.get_password() {
        Ok(b64) => {
            let bytes = STANDARD
                .decode(b64.trim())
                .map_err(|e| format!("ERR_GDRIVE: decode encryption key: {e}"))?;
            if bytes.len() != 32 {
                return Err("ERR_GDRIVE: stored encryption key has wrong length".to_string());
            }
            let mut key = [0u8; 32];
            key.copy_from_slice(&bytes);
            Ok(key)
        }
        Err(_) => {
            let mut key = [0u8; 32];
            OsRng.fill_bytes(&mut key);
            entry
                .set_password(&STANDARD.encode(key))
                .map_err(|e| format!("ERR_KEYRING: save encryption key: {e}"))?;
            Ok(key)
        }
    }
}

// Legacy V1 encrypt — retained for reference/compat only. New backups use the
// portable V2 format (encrypt_bytes_v2); the V1 read path (decrypt_bytes) stays
// live for restoring old blobs. Crypto logic intentionally unchanged.
#[allow(dead_code)]
fn encrypt_bytes(key_bytes: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key_bytes));
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext)
        .map_err(|e| format!("ERR_GDRIVE: encrypt backup: {e}"))?;
    let mut out = Vec::with_capacity(12 + ciphertext.len());
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

fn decrypt_bytes(key_bytes: &[u8; 32], data: &[u8]) -> Result<Vec<u8>, String> {
    if data.len() < 12 {
        return Err("ERR_GDRIVE: encrypted data too short to contain nonce".to_string());
    }
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key_bytes));
    cipher
        .decrypt(Nonce::from_slice(&data[..12]), &data[12..])
        .map_err(|_| {
            "ERR_GDRIVE: decryption failed — backup may be corrupted or was encrypted \
             on a different machine (key mismatch)"
                .to_string()
        })
}

// ── Backup format V2 (portable, passphrase-derived) ───────────────────────────
//
// V2 fixes V1's machine-bound key: instead of a random key locked in this PC's
// Windows Credential Manager, the AES-256 key is derived from a user passphrase
// via Argon2id(passphrase, salt). The salt is random per backup and stored in the
// header, so any machine with the passphrase can decrypt. See the constants block
// above and docs/backup-encryption-v2-spec.md for the full header layout.

/// Returns true if `data` begins with the V2 family magic b"EXIV".
///
/// Routing is by **magic only**, not magic+version, so that an EXIV blob carrying
/// an unknown/newer version byte is still routed into the V2 decryptor — which
/// then rejects it with a clear "newer app version" error (spec §3 forward rule)
/// instead of silently falling through to the V1 machine-key path.
///
/// V1 blobs start with a random 12-byte nonce, so a false positive requires that
/// nonce's first 4 bytes to equal b"EXIV" (probability 2⁻³², deemed safe in
/// spec §4). Such a freak collision would surface a V2 error rather than restore,
/// but cannot corrupt data.
fn is_v2_format(data: &[u8]) -> bool {
    data.len() >= 4 && &data[0..4] == BACKUP_MAGIC
}

/// Builds an Argon2id hasher for the given kdf_id profile. Decoupling the profile
/// from the format version lets us tune Argon2 cost later by adding a new kdf_id
/// without breaking already-stored backups.
fn argon2_for_kdf(kdf_id: u8) -> Result<Argon2<'static>, String> {
    match kdf_id {
        KDF_ID_ARGON2ID_1 => {
            let params = Params::new(ARGON2_M_COST, ARGON2_T_COST, ARGON2_P_COST, Some(32))
                .map_err(|e| format!("ERR_GDRIVE: argon2 params: {e}"))?;
            Ok(Argon2::new(Algorithm::Argon2id, Version::V0x13, params))
        }
        other => Err(format!(
            "ERR_GDRIVE: unsupported key-derivation profile (kdf_id {other}) — please update the app"
        )),
    }
}

/// Derives the 32-byte AES key from a passphrase and the stored salt. The salt is
/// the raw 16 bytes from the header (not a PHC SaltString), so derivation is
/// reproducible on any machine from passphrase + file alone.
fn derive_key_v2(passphrase: &str, salt: &[u8], kdf_id: u8) -> Result<[u8; 32], String> {
    let argon2 = argon2_for_kdf(kdf_id)?;
    let mut key = [0u8; 32];
    argon2
        .hash_password_into(passphrase.as_bytes(), salt, &mut key)
        .map_err(|e| format!("ERR_GDRIVE: key derivation failed: {e}"))?;
    Ok(key)
}

/// Encrypts `plaintext` into a V2 blob: assemble the 36-byte header (magic,
/// version, kdf_id, reserved, random salt, random nonce), derive the key from the
/// passphrase + salt, then AES-256-GCM encrypt with the first 8 header bytes bound
/// as AAD. Output = header || ciphertext+tag.
fn encrypt_bytes_v2(passphrase: &str, plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let mut salt = [0u8; V2_SALT_LEN];
    OsRng.fill_bytes(&mut salt);
    let mut nonce = [0u8; V2_NONCE_LEN];
    OsRng.fill_bytes(&mut nonce);

    // Header: [magic 4][version 1][kdf_id 1][reserved 2][salt 16][nonce 12] = 36B.
    let mut header = Vec::with_capacity(V2_HEADER_LEN);
    header.extend_from_slice(BACKUP_MAGIC);
    header.push(BACKUP_VERSION_V2);
    header.push(KDF_ID_ARGON2ID_1);
    header.extend_from_slice(&[0u8, 0u8]); // reserved
    header.extend_from_slice(&salt);
    header.extend_from_slice(&nonce);

    let key = derive_key_v2(passphrase, &salt, KDF_ID_ARGON2ID_1)?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let aad = &header[..V2_AAD_LEN];
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce), Payload { msg: plaintext, aad })
        .map_err(|e| format!("ERR_GDRIVE: encrypt backup (v2): {e}"))?;

    let mut out = Vec::with_capacity(V2_HEADER_LEN + ciphertext.len());
    out.extend_from_slice(&header);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

/// Decrypts a V2 blob. Parses the header, re-derives the key from the passphrase +
/// stored salt, and AES-256-GCM decrypts with the header's first 8 bytes as AAD.
/// A wrong passphrase, corrupt body, or tampered header all surface as a tag
/// mismatch (cannot be cryptographically distinguished without a key-check field).
fn decrypt_bytes_v2(passphrase: &str, data: &[u8]) -> Result<Vec<u8>, String> {
    if data.len() < V2_HEADER_LEN + 16 {
        return Err("ERR_GDRIVE: backup file is incomplete or corrupted (v2)".to_string());
    }
    let version = data[4];
    if version != BACKUP_VERSION_V2 {
        return Err(format!(
            "ERR_GDRIVE: backup created by a newer app version (v{version}) — please update the app"
        ));
    }
    let kdf_id = data[5];
    let salt = &data[8..8 + V2_SALT_LEN];
    let nonce = &data[24..24 + V2_NONCE_LEN];
    let aad = &data[..V2_AAD_LEN];
    let ciphertext = &data[V2_HEADER_LEN..];

    let key = derive_key_v2(passphrase, salt, kdf_id)?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    cipher
        .decrypt(Nonce::from_slice(nonce), Payload { msg: ciphertext, aad })
        .map_err(|_| "ERR_GDRIVE: wrong passphrase or corrupted backup".to_string())
}

/// Version-detecting decrypt dispatcher for downloaded `.enc` blobs.
///
/// Decision tree (see docs/backup-encryption-v2-spec.md §5):
///   * V2 header detected → requires a passphrase; derive key and decrypt.
///   * otherwise (legacy V1) → decrypt with this machine's stored key.
///
/// `passphrase` is currently always `None` (no UI yet); a V2 blob therefore
/// returns a clear "passphrase required" error rather than failing obscurely.
/// V1 restores are unaffected and keep working through the machine-key path.
fn decrypt_backup(data: &[u8], passphrase: Option<&str>) -> Result<Vec<u8>, String> {
    if is_v2_format(data) {
        match passphrase {
            Some(pp) => decrypt_bytes_v2(pp, data),
            // Stable marker token `ERR_PASSPHRASE_REQUIRED` — the frontend detects
            // this to know a V2 backup needs a passphrase, then prompts and retries
            // the same restore call with the passphrase (no restart in between).
            None => Err(
                "ERR_PASSPHRASE_REQUIRED: this backup is passphrase-protected (V2); \
                 enter the backup passphrase to restore"
                    .to_string(),
            ),
        }
    } else {
        // Legacy V1: [nonce 12B][ciphertext+tag], decrypted with the machine key.
        let enc_key = load_or_create_encryption_key()?;
        decrypt_bytes(&enc_key, data)
    }
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

fn ureq_err(ctx: &str, e: ureq::Error) -> String {
    match e {
        ureq::Error::Status(code, resp) => {
            let body = resp.into_string().unwrap_or_default();
            format!("ERR_GDRIVE: {ctx} — HTTP {code}: {body}")
        }
        other => format!("ERR_GDRIVE: {ctx}: {other}"),
    }
}

/// Wraps Drive API HTTP errors. On 401 or scope-related 403 it clears the
/// stored token and returns `ERR_SCOPE:` so the frontend can surface a
/// targeted re-connect prompt rather than a raw JSON blob.
fn drive_api_err(ctx: &str, e: ureq::Error) -> String {
    let msg = format!("{e}");
    let code = match &e {
        ureq::Error::Status(c, _) => *c,
        _ => return format!("ERR_GDRIVE: {ctx}: {msg}"),
    };

    if code == 401
        || (code == 403
            && (msg.contains("ACCESS_TOKEN_SCOPE_INSUFFICIENT")
                || msg.contains("insufficientPermissions")
                || msg.contains("PERMISSION_DENIED")))
    {
        let _ = tokens_delete();
        return "ERR_SCOPE: Insufficient Drive permissions — token cleared. \
            1) Enable the Google Drive API in Google Cloud Console. \
            2) Click Disconnect then reconnect Google Drive."
            .to_string();
    }

    format!("ERR_GDRIVE: {ctx} — HTTP {code}: {msg}")
}

fn http_exchange_code(
    code: &str,
    verifier: &str,
    redirect_uri: &str,
    cfg: &OAuthConfig,
) -> Result<(String, String, i64), String> {
    let mut form: Vec<(&str, &str)> = vec![
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", redirect_uri),
        ("client_id", &cfg.client_id),
        ("code_verifier", verifier),
    ];
    if !cfg.client_secret.is_empty() {
        form.push(("client_secret", &cfg.client_secret));
    }
    let resp = ureq::post(TOKEN_URL)
        .send_form(&form)
        .map_err(|e| ureq_err("token exchange", e))?;

    let body: serde_json::Value = resp
        .into_json()
        .map_err(|e| format!("ERR_GDRIVE: parse token response: {e}"))?;

    let access = body["access_token"]
        .as_str()
        .ok_or("ERR_GDRIVE: missing access_token")?
        .to_string();
    let refresh = body["refresh_token"]
        .as_str()
        .ok_or(
            "ERR_GDRIVE: missing refresh_token — ensure access_type=offline and prompt=consent",
        )?
        .to_string();
    let expires_in = body["expires_in"].as_i64().unwrap_or(3600);
    let expires_at = chrono::Utc::now().timestamp() + expires_in - 60;
    Ok((access, refresh, expires_at))
}

fn http_refresh_token(refresh: &str, cfg: &OAuthConfig) -> Result<(String, i64), String> {
    let mut form: Vec<(&str, &str)> = vec![
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh),
        ("client_id", &cfg.client_id),
    ];
    if !cfg.client_secret.is_empty() {
        form.push(("client_secret", &cfg.client_secret));
    }
    let resp = ureq::post(TOKEN_URL)
        .send_form(&form)
        .map_err(|e| ureq_err("token refresh", e))?;

    let body: serde_json::Value = resp
        .into_json()
        .map_err(|e| format!("ERR_GDRIVE: parse refresh response: {e}"))?;

    let access = body["access_token"]
        .as_str()
        .ok_or("ERR_GDRIVE: missing access_token in refresh")?
        .to_string();
    let expires_in = body["expires_in"].as_i64().unwrap_or(3600);
    let expires_at = chrono::Utc::now().timestamp() + expires_in - 60;
    Ok((access, expires_at))
}

fn http_fetch_email(access_token: &str) -> Result<String, String> {
    let resp = ureq::get(USERINFO_URL)
        .set("Authorization", &format!("Bearer {access_token}"))
        .call()
        .map_err(|e| ureq_err("userinfo", e))?;
    let body: serde_json::Value = resp
        .into_json()
        .map_err(|e| format!("ERR_GDRIVE: parse userinfo: {e}"))?;
    Ok(body["email"]
        .as_str()
        .unwrap_or("unknown@google.com")
        .to_string())
}

fn http_revoke(token: &str) {
    let _ = ureq::post(&format!("{REVOKE_URL}?token={token}")).call();
}

fn get_access_token() -> Result<String, String> {
    let mut t =
        tokens_load().ok_or("ERR_GDRIVE: not connected — call gdrive_start_auth first")?;
    if chrono::Utc::now().timestamp() >= t.expires_at {
        let cfg = load_oauth_config()?;
        let (new_access, new_expires) = http_refresh_token(&t.refresh_token, &cfg)?;
        t.access_token = new_access;
        t.expires_at = new_expires;
        tokens_save(&t)?;
    }
    Ok(t.access_token)
}

// ── Drive API ─────────────────────────────────────────────────────────────────

fn drive_upload_file(
    access_token: &str,
    file_bytes: &[u8],
    file_name: &str,
) -> Result<(String, Option<String>), String> {
    let metadata = serde_json::json!({ "name": file_name }).to_string();
    let boundary = "XExportInvBoundaryK9m3p7";

    let mut body: Vec<u8> = Vec::new();
    write!(
        &mut body,
        "--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{metadata}\r\n"
    )
    .ok();
    write!(
        &mut body,
        "--{boundary}\r\nContent-Type: application/octet-stream\r\n\r\n"
    )
    .ok();
    body.extend_from_slice(file_bytes);
    write!(&mut body, "\r\n--{boundary}--\r\n").ok();

    let resp = ureq::post(DRIVE_UPLOAD_URL)
        .set("Authorization", &format!("Bearer {access_token}"))
        .set(
            "Content-Type",
            &format!("multipart/related; boundary={boundary}"),
        )
        .send_bytes(&body)
        .map_err(|e| drive_api_err("drive upload", e))?;

    let data: serde_json::Value = resp
        .into_json()
        .map_err(|e| format!("ERR_GDRIVE: parse upload response: {e}"))?;

    let file_id = data["id"].as_str().unwrap_or("").to_string();
    let link = data["webViewLink"].as_str().map(|s| s.to_string());
    Ok((file_id, link))
}

fn drive_list_files(access_token: &str) -> Result<Vec<GDriveFile>, String> {
    let url = format!(
        "{DRIVE_FILES_URL}\
        ?q=name+contains+'export_invoice_backup'+and+trashed%3Dfalse\
        &fields=files(id,name,createdTime,size,webViewLink)\
        &orderBy=createdTime+desc&pageSize=20"
    );
    let resp = ureq::get(&url)
        .set("Authorization", &format!("Bearer {access_token}"))
        .call()
        .map_err(|e| drive_api_err("drive list", e))?;

    let data: serde_json::Value = resp
        .into_json()
        .map_err(|e| format!("ERR_GDRIVE: parse list response: {e}"))?;

    Ok(data["files"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .iter()
        .map(|f| GDriveFile {
            id: f["id"].as_str().unwrap_or("").to_string(),
            name: f["name"].as_str().unwrap_or("").to_string(),
            created_time: f["createdTime"].as_str().unwrap_or("").to_string(),
            size_bytes: f["size"].as_str().map(|s| s.to_string()),
            web_view_link: f["webViewLink"].as_str().map(|s| s.to_string()),
        })
        .collect())
}

// ── OAuth loopback flow ───────────────────────────────────────────────────────

fn run_oauth_flow(cfg: &OAuthConfig) -> Result<StoredTokens, String> {
    if cfg.client_id.trim().is_empty() {
        return Err(
            "ERR_CONFIG: Client ID not configured. \
            Enter your Google OAuth credentials under Admin → Database → Backup → Google Drive."
                .to_string(),
        );
    }

    let (verifier, challenge) = generate_pkce();
    let csrf_state = generate_state();

    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("ERR_GDRIVE: start redirect server: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("ERR_GDRIVE: {e}"))?
        .port();
    let redirect_uri = format!("http://127.0.0.1:{port}/callback");

    let scopes_encoded = SCOPE.replace(' ', "%20");
    let client_id = &cfg.client_id;
    let auth_url = format!(
        "{AUTH_URL}\
        ?client_id={client_id}\
        &redirect_uri={redirect_uri}\
        &response_type=code\
        &scope={scopes_encoded}\
        &code_challenge={challenge}\
        &code_challenge_method=S256\
        &state={csrf_state}\
        &access_type=offline\
        &prompt=consent"
    );

    if let Err(e) = webbrowser::open(&auth_url) {
        eprintln!("[gdrive] browser open failed: {e}. User must visit: {auth_url}");
    }

    let (tx, rx) = std::sync::mpsc::channel::<Result<std::net::TcpStream, String>>();
    std::thread::spawn(move || {
        let result = listener
            .accept()
            .map(|(s, _)| s)
            .map_err(|e| format!("ERR_GDRIVE: accept: {e}"));
        let _ = tx.send(result);
    });

    let mut stream = rx
        .recv_timeout(std::time::Duration::from_secs(OAUTH_TIMEOUT_SECS))
        .map_err(|_| {
            format!(
                "ERR_GDRIVE: timed out waiting for browser redirect ({OAUTH_TIMEOUT_SECS}s). Please retry."
            )
        })?
        ?;

    let request_line = {
        let mut reader = BufReader::new(&stream);
        let mut line = String::new();
        reader
            .read_line(&mut line)
            .map_err(|e| format!("ERR_GDRIVE: reading callback: {e}"))?;
        line
    };

    let path = request_line.split_whitespace().nth(1).unwrap_or("/");
    let query_str = path.split_once('?').map(|(_, q)| q).unwrap_or("");
    let params: HashMap<String, String> = query_str
        .split('&')
        .filter_map(|kv| kv.split_once('=').map(|(k, v)| (k.to_string(), v.to_string())))
        .collect();

    let (ok, html) = if let Some(err) = params.get("error") {
        (false, format!(
            "<html><body style='font-family:sans-serif;padding:2rem'>\
            <h2 style='color:#c00'>Authorization declined</h2>\
            <p><code>{err}</code></p>\
            <p>You can close this tab and retry in Export Invoice.</p></body></html>"
        ))
    } else {
        (true, "<html><body style='font-family:sans-serif;padding:2rem'>\
            <h2 style='color:#155724'>Connected to Google Drive ✓</h2>\
            <p>Authorization successful. You may close this tab and return to Export Invoice.</p>\
            </body></html>".to_string())
    };

    let status = if ok { "200 OK" } else { "400 Bad Request" };
    let _ = stream.write_all(
        format!(
            "HTTP/1.1 {status}\r\n\
            Content-Type: text/html; charset=utf-8\r\n\
            Content-Length: {}\r\n\
            Connection: close\r\n\r\n{html}",
            html.len()
        )
        .as_bytes(),
    );
    let _ = stream.flush();

    if !ok {
        let err_val = params.get("error").map(|s| s.as_str()).unwrap_or("unknown");
        return Err(format!("ERR_GDRIVE: authorization declined: {err_val}"));
    }

    match params.get("state") {
        Some(s) if s == &csrf_state => {}
        _ => return Err("ERR_GDRIVE: state mismatch — possible CSRF attempt".to_string()),
    }

    let code = params
        .get("code")
        .ok_or("ERR_GDRIVE: missing authorization code in callback")?;

    let (access_token, refresh_token, expires_at) =
        http_exchange_code(code, &verifier, &redirect_uri, cfg)?;
    let email = http_fetch_email(&access_token)?;

    Ok(StoredTokens { access_token, refresh_token, expires_at, email })
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Returns the stored OAuth config (client_id visible; secret presence only).
#[tauri::command]
pub fn gdrive_get_oauth_config(session: State<'_, AuthSession>) -> Result<OAuthConfigStatus, String> {
    let sess = session.get()?;
    if sess.role != "admin" {
        return Err("ERR_PERMISSION: admin role required".to_string());
    }
    match load_oauth_config() {
        Ok(cfg) => Ok(OAuthConfigStatus {
            client_id: cfg.client_id,
            has_secret: !cfg.client_secret.is_empty(),
        }),
        Err(_) => Ok(OAuthConfigStatus { client_id: String::new(), has_secret: false }),
    }
}

/// Saves the OAuth client credentials to disk. Empty client_secret is valid
/// (PKCE alone is sufficient for Desktop app OAuth clients).
#[tauri::command]
pub fn gdrive_save_oauth_config(
    session: State<'_, AuthSession>,
    client_id: String,
    client_secret: String,
) -> Result<(), String> {
    let sess = session.get()?;
    if sess.role != "admin" {
        return Err("ERR_PERMISSION: admin role required".to_string());
    }
    let client_id = client_id.trim().to_string();
    if client_id.is_empty() {
        return Err("ERR_GDRIVE: client_id must not be empty".to_string());
    }
    save_oauth_config_to_disk(&OAuthConfig {
        client_id,
        client_secret: client_secret.trim().to_string(),
    })
}

#[tauri::command]
pub fn gdrive_get_status(session: State<'_, AuthSession>) -> Result<GDriveStatus, String> {
    session.get()?;
    Ok(match tokens_load() {
        Some(t) => GDriveStatus { connected: true, email: Some(t.email) },
        None => GDriveStatus { connected: false, email: None },
    })
}

#[tauri::command]
pub fn gdrive_start_auth(session: State<'_, AuthSession>) -> Result<GDriveStatus, String> {
    let sess = session.get()?;
    if sess.role != "admin" {
        return Err("ERR_PERMISSION: admin role required for Google Drive setup".to_string());
    }
    let cfg = load_oauth_config()?;
    let tokens = run_oauth_flow(&cfg)?;
    let email = tokens.email.clone();
    tokens_save(&tokens)?;
    Ok(GDriveStatus { connected: true, email: Some(email) })
}

#[tauri::command]
pub fn gdrive_backup_and_upload(
    session: State<'_, AuthSession>,
    db: State<'_, AppDb>,
    // PASSPHRASE (frontend → Rust): the user-entered backup passphrase, passed as
    // a one-shot IPC argument from DatabaseManagement.tsx. It is used only to
    // derive the V2 AES key here and is never persisted, logged, or echoed back.
    passphrase: String,
) -> Result<GDriveBackupResult, String> {
    let sess = session.get()?;
    if sess.role != "admin" {
        return Err("ERR_PERMISSION: admin role required for Google Drive backup".to_string());
    }

    // Backend defense-in-depth: enforce the minimum passphrase length even though
    // the UI also validates. Do NOT log the passphrase or its contents.
    if passphrase.chars().count() < MIN_BACKUP_PASSPHRASE_LEN {
        return Err(format!(
            "ERR_GDRIVE: backup passphrase must be at least {MIN_BACKUP_PASSPHRASE_LEN} characters"
        ));
    }

    let stamp = chrono::Local::now().format("%Y-%m-%dT%H-%M-%S");
    let file_name = format!("export_invoice_backup_{stamp}.db");
    let tmp_path = std::env::temp_dir().join(&file_name).display().to_string();

    db.with_conn(|conn| {
        crate::commands::backup::logic_backup_database(
            conn,
            &tmp_path,
            &sess.role,
            Some(sess.user_id),
        )
    })?;

    let info = crate::commands::backup::logic_verify_backup(&tmp_path, &sess.role)?;
    let integrity_ok = info.integrity_status == "ok";
    let sha256 = info.sha256.clone();
    let size_bytes = info.size_bytes;

    let raw_bytes = std::fs::read(&tmp_path)
        .map_err(|e| format!("ERR_GDRIVE: read temp backup: {e}"))?;
    let _ = std::fs::remove_file(&tmp_path);

    if !integrity_ok {
        return Err(format!(
            "ERR_GDRIVE: backup integrity check failed: {}",
            info.integrity_status
        ));
    }

    // New backups use the portable V2 format (Argon2id passphrase-derived key) so
    // they can be restored on any machine. The legacy V1 machine-key path
    // (load_or_create_encryption_key/encrypt_bytes) is retained only for decrypting
    // old V1 blobs and is intentionally no longer called here.
    let file_bytes = encrypt_bytes_v2(&passphrase, &raw_bytes)?;
    let file_name = format!("{file_name}.enc");

    let access_token = get_access_token()?;
    let (file_id, web_view_link) = drive_upload_file(&access_token, &file_bytes, &file_name)?;

    Ok(GDriveBackupResult {
        file_id,
        file_name,
        web_view_link,
        size_bytes,
        sha256,
        integrity_ok,
    })
}

#[tauri::command]
pub fn gdrive_list_backups(session: State<'_, AuthSession>) -> Result<Vec<GDriveFile>, String> {
    session.get()?;
    let access_token = get_access_token()?;
    drive_list_files(&access_token)
}

/// Downloads a Drive backup by file ID, persists it to a stable path within the
/// application config directory, validates integrity, and stages it for restore
/// (takes effect after app restart).
///
/// The staged file MUST survive until the next startup — it is NOT deleted here.
/// `apply_pending_restore` (backup.rs) copies it to the live DB path on startup
/// and cleans it up only after a successful copy.
#[tauri::command]
pub fn gdrive_download_and_stage_restore(
    session: State<'_, AuthSession>,
    file_id: String,
    file_name: String,
    // PASSPHRASE (frontend → Rust): optional. Required only for V2 backups; the
    // frontend passes it after detecting a V2 file (or prompting on first failure).
    // V1 and plain `.db` restores pass None. Never persisted, logged, or returned.
    passphrase: Option<String>,
) -> Result<(), String> {
    let sess = session.get()?;
    if sess.role != "admin" {
        return Err("ERR_PERMISSION: admin role required".to_string());
    }

    let access_token = get_access_token()?;

    let url = format!("https://www.googleapis.com/drive/v3/files/{file_id}?alt=media");
    let resp = ureq::get(&url)
        .set("Authorization", &format!("Bearer {access_token}"))
        .call()
        .map_err(|e| drive_api_err("drive download", e))?;

    // Persist to the app config dir — not a temp dir — so the file is still
    // present when apply_pending_restore runs on the next startup. OS temp dirs
    // can be cleared between sessions, which caused the original silent skip.
    let config_dir = app_config_dir()
        .ok_or("ERR_GDRIVE: cannot determine app config directory")?;
    std::fs::create_dir_all(&config_dir)
        .map_err(|e| format!("ERR_GDRIVE: create config dir: {e}"))?;
    let staged_path = config_dir
        .join(crate::commands::backup::STAGED_RESTORE_FILE)
        .display()
        .to_string();

    eprintln!("[gdrive] staging restore from Drive file: {file_name} → {staged_path}");

    {
        use std::io::Read;
        let mut raw = Vec::new();
        resp.into_reader()
            .read_to_end(&mut raw)
            .map_err(|e| format!("ERR_GDRIVE: download read: {e}"))?;
        // `.enc` → encrypted backup: detect V2 (portable, passphrase) vs legacy
        // V1 (machine key) by header and decrypt accordingly. Non-`.enc` files are
        // plain `.db` and used as-is. The passphrase (when present) is forwarded to
        // the V2 decryptor; V1/`.db` ignore it.
        let bytes = if file_name.ends_with(".enc") {
            decrypt_backup(&raw, passphrase.as_deref())?
        } else {
            raw
        };
        std::fs::write(&staged_path, &bytes)
            .map_err(|e| format!("ERR_GDRIVE: write staged file: {e}"))?;
    }

    // Validate integrity and record staged_path in pending_restore.txt.
    // Do NOT delete staged_path — apply_pending_restore needs it on next startup.
    crate::commands::backup::logic_validate_and_stage_restore(
        &staged_path,
        &sess.role,
        Some(sess.user_id),
        None,
    )?;

    // Confirm the staged file still exists and has content before reporting success.
    let staged_size = std::fs::metadata(&staged_path)
        .map_err(|e| format!("ERR_GDRIVE: staged file missing after staging: {e}"))?
        .len();
    if staged_size == 0 {
        return Err("ERR_GDRIVE: staged restore file is empty after staging".to_string());
    }

    Ok(())
}

#[tauri::command]
pub fn gdrive_disconnect(session: State<'_, AuthSession>) -> Result<(), String> {
    let sess = session.get()?;
    if sess.role != "admin" {
        return Err("ERR_PERMISSION: admin role required".to_string());
    }
    if let Some(t) = tokens_load() {
        http_revoke(&t.access_token);
    }
    tokens_delete()
}

#[cfg(test)]
mod tests {
    use super::*;

    const PASS: &str = "correct horse battery";
    const PLAIN: &[u8] = b"SQLite format 3\0 ... backup body bytes ...";

    // Case 1 + 2 + 12: a V2 backup created with a passphrase round-trips back to
    // the original plaintext using only the passphrase + the salt embedded in the
    // blob. No machine-local key is involved, which is exactly what makes the blob
    // portable from Machine A to Machine B (case 12).
    #[test]
    fn v2_roundtrip_correct_passphrase() {
        let blob = encrypt_bytes_v2(PASS, PLAIN).unwrap();
        // Header is self-describing: magic, version, kdf_id, lengths.
        assert_eq!(&blob[0..4], BACKUP_MAGIC);
        assert_eq!(blob[4], BACKUP_VERSION_V2);
        assert_eq!(blob[5], KDF_ID_ARGON2ID_1);
        assert!(blob.len() >= V2_HEADER_LEN + 16);
        // Random salt + nonce: two backups of the same data differ.
        let blob2 = encrypt_bytes_v2(PASS, PLAIN).unwrap();
        assert_ne!(blob[8..36], blob2[8..36], "salt+nonce must be random per backup");

        let out = decrypt_bytes_v2(PASS, &blob).unwrap();
        assert_eq!(out, PLAIN);
        // Via the dispatcher (the path the restore command uses).
        let out2 = decrypt_backup(&blob, Some(PASS)).unwrap();
        assert_eq!(out2, PLAIN);
    }

    // Case 3: wrong passphrase → GCM tag mismatch → distinct error.
    #[test]
    fn v2_wrong_passphrase() {
        let blob = encrypt_bytes_v2(PASS, PLAIN).unwrap();
        let err = decrypt_bytes_v2("wrong passphrase!!", &blob).unwrap_err();
        assert!(err.contains("wrong passphrase or corrupted backup"), "got: {err}");
    }

    // Case 4: empty passphrase at the crypto layer fails to decrypt a real blob.
    // (The backup command also rejects passphrases shorter than
    // MIN_BACKUP_PASSPHRASE_LEN before encryption ever runs.)
    #[test]
    fn v2_empty_passphrase_fails() {
        let blob = encrypt_bytes_v2(PASS, PLAIN).unwrap();
        let err = decrypt_bytes_v2("", &blob).unwrap_err();
        assert!(err.contains("wrong passphrase or corrupted backup"), "got: {err}");
        assert!("".chars().count() < MIN_BACKUP_PASSPHRASE_LEN);
    }

    // Case 5: truncated/corrupted V2 blob → distinct "incomplete or corrupted".
    #[test]
    fn v2_truncated() {
        let blob = encrypt_bytes_v2(PASS, PLAIN).unwrap();
        let truncated = &blob[..V2_HEADER_LEN + 4]; // header + partial ct, < header+tag
        let err = decrypt_bytes_v2(PASS, truncated).unwrap_err();
        assert!(err.contains("incomplete or corrupted"), "got: {err}");
    }

    // Case 6: an EXIV blob carrying an unknown/newer version is routed to the V2
    // decryptor (magic-only detection) and rejected with a clear version error,
    // rather than silently falling back to the V1 machine-key path.
    #[test]
    fn v2_future_version_rejected() {
        let mut blob = encrypt_bytes_v2(PASS, PLAIN).unwrap();
        blob[4] = 0x03; // bump version byte to a future, unknown version
        assert!(is_v2_format(&blob), "magic-only detection must still route to V2");
        let err = decrypt_bytes_v2(PASS, &blob).unwrap_err();
        assert!(err.contains("newer app version"), "got: {err}");
    }

    // Case 7 + 8 (detection half): legacy V1 blobs ([nonce][ct]) and plain `.db`
    // bytes are NOT detected as V2, so they take the V1 / raw path unchanged.
    // (Full V1 round-trip uses the machine keyring and is exercised at runtime,
    // not in unit tests.)
    #[test]
    fn non_v2_not_detected() {
        let v1_like = vec![0u8; 60]; // first 4 bytes != "EXIV"
        assert!(!is_v2_format(&v1_like));
        let sqlite_magic = b"SQLite format 3\0".to_vec();
        assert!(!is_v2_format(&sqlite_magic));
        // Boundary: too short to even hold the magic.
        assert!(!is_v2_format(b"EXI"));
    }

    // Case 10: dispatcher with no passphrase on a V2 blob returns the stable
    // ERR_PASSPHRASE_REQUIRED marker the frontend keys on.
    #[test]
    fn v2_no_passphrase_returns_marker() {
        let blob = encrypt_bytes_v2(PASS, PLAIN).unwrap();
        let err = decrypt_backup(&blob, None).unwrap_err();
        assert!(err.contains("ERR_PASSPHRASE_REQUIRED"), "got: {err}");
    }

    // AAD binding: tampering an authenticated header byte (kdf_id) breaks the tag.
    #[test]
    fn v2_header_tamper_detected() {
        let mut blob = encrypt_bytes_v2(PASS, PLAIN).unwrap();
        blob[5] = KDF_ID_ARGON2ID_1; // unchanged value to keep kdf valid...
        blob[6] = 0xFF; // ...but flip a reserved AAD byte → tag must fail
        let err = decrypt_bytes_v2(PASS, &blob).unwrap_err();
        assert!(err.contains("wrong passphrase or corrupted backup"), "got: {err}");
    }
}
