import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { env } from "../config/env";

/**
 * AES-256-GCM encryption for secrets at rest (EC private keys, ZATCA compliance/production
 * secrets). Never store these fields in plaintext.
 *
 * Format: base64(iv[12] || authTag[16] || ciphertext)
 */

function getKey(): Buffer {
  const key = Buffer.from(env.zatca.encryptionKey, "base64");
  if (key.length !== 32) {
    throw new Error("ZATCA_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256)");
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
