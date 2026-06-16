// Release preflight: prove the updater signing secret matches the pubkey
// baked into the app. A mismatch is the cause of the in-app updater error
// "The signature was created with a different key than the one provided".
//
// Strategy: derive the key id from `plugins.updater.pubkey` in tauri.conf.json,
// then sign a throwaway payload with TAURI_SIGNING_PRIVATE_KEY and derive the
// key id from the produced .sig. If they differ, fail the release BEFORE any
// artifact is published, so a drifted key can never ship again.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// minisign/rsign blob (base64 of a text whose 2nd line is the base64 key/sig
// data). Key id = bytes [2..10) of that data, little-endian -> hex.
function keyId(blobB64) {
  const text = Buffer.from(blobB64.trim(), 'base64').toString('utf8');
  const dataLine = text.split('\n')[1];
  const bytes = Buffer.from(dataLine, 'base64');
  return Buffer.from(bytes.subarray(2, 10)).reverse().toString('hex').toUpperCase();
}

const conf = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const pubKeyId = keyId(conf.plugins.updater.pubkey);

const secret = process.env.TAURI_SIGNING_PRIVATE_KEY;
if (!secret) {
  console.error('FAIL: TAURI_SIGNING_PRIVATE_KEY is not set in the environment.');
  process.exit(1);
}
const password = process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? '';

const dir = mkdtempSync(join(tmpdir(), 'updater-key-'));
const keyPath = join(dir, 'key');
const payload = join(dir, 'payload.txt');
writeFileSync(keyPath, secret);
writeFileSync(payload, 'updater-key-preflight');

// The Tauri CLI errors if both --private-key-path and the env-var form of the
// key are present, so strip the env forms before invoking the signer.
const childEnv = { ...process.env };
delete childEnv.TAURI_SIGNING_PRIVATE_KEY;
delete childEnv.TAURI_SIGNING_PRIVATE_KEY_PATH;

try {
  execSync(
    `npx tauri signer sign --private-key-path "${keyPath}" --password "${password}" "${payload}"`,
    { env: childEnv, stdio: 'inherit' }
  );
  const sigKeyId = keyId(readFileSync(`${payload}.sig`, 'utf8'));

  if (sigKeyId !== pubKeyId) {
    console.error(
      `\nFAIL: updater key mismatch.\n` +
      `  embedded pubkey  : ${pubKeyId}\n` +
      `  signing secret   : ${sigKeyId}\n` +
      `Update TAURI_SIGNING_PRIVATE_KEY (repo secret) or plugins.updater.pubkey ` +
      `so both use the same key, then re-tag.`
    );
    process.exit(1);
  }
  console.log(`OK: updater signing key matches embedded pubkey (${pubKeyId}).`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
