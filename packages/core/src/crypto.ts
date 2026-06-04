import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { resolveSecretPath } from "@lgnc/db";

const ALGO = "aes-256-gcm";

let cachedKey: Buffer | null = null;

/**
 * Loads (or creates on first run) the machine-local 256-bit secret used to
 * encrypt API keys at rest. The key file never leaves this machine.
 */
function getSecretKey(): Buffer {
  if (cachedKey) return cachedKey;
  const path = resolveSecretPath();
  if (existsSync(path)) {
    cachedKey = Buffer.from(readFileSync(path, "utf8").trim(), "hex");
  } else {
    const key = randomBytes(32);
    writeFileSync(path, key.toString("hex"), { mode: 0o600 });
    try {
      chmodSync(path, 0o600);
    } catch {
      // Best effort on platforms that don't support chmod (e.g. some Windows setups).
    }
    cachedKey = key;
  }
  return cachedKey;
}

/** Encrypts plaintext into a self-describing "iv:tag:ciphertext" hex string. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getSecretKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(":");
}

/** Reverses {@link encryptSecret}. Throws if the payload is malformed or tampered with. */
export function decryptSecret(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Malformed encrypted payload");
  }
  const decipher = createDecipheriv(ALGO, getSecretKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}
