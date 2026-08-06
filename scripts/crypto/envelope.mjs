// Build-time encryption for the password-gated visits blob.
//
// Uses node:crypto's WebCrypto (`webcrypto.subtle`) — deliberately NOT the classic
// createCipheriv API — so the AES-GCM auth tag is appended to the ciphertext exactly
// the way the browser's crypto.subtle produces and expects it. web/crypto.js is the
// mirror of decrypt() below (the browser can't import this module); keep the two
// deriveKey/decrypt shapes in sync.
import { webcrypto as crypto } from "node:crypto";

const ITERATIONS = 600_000; // OWASP floor for PBKDF2-HMAC-SHA256; stored in the envelope so it can be raised later without breaking old blobs.
const enc = new TextEncoder();
const dec = new TextDecoder();
const toB64 = (u8) => Buffer.from(u8).toString("base64");
const fromB64 = (s) => new Uint8Array(Buffer.from(s, "base64"));

// PBKDF2(password) -> AES-256-GCM key. `usage` is ["encrypt"] or ["decrypt"].
async function deriveKey(password, salt, iterations, usage) {
  const baseKey = await crypto.subtle.importKey(
    "raw", enc.encode(password.normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    baseKey, { name: "AES-GCM", length: 256 }, false, usage);
}

// Encrypt a JSON-serializable object into a self-describing envelope.
export async function encrypt(password, obj) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITERATIONS, ["encrypt"]);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(obj)));
  return { v: 1, kdf: "PBKDF2", hash: "SHA-256", iterations: ITERATIONS, salt: toB64(salt), iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}

// Decrypt an envelope back to the original object. Throws on a wrong password
// (the GCM tag fails to verify) or an unsupported envelope version.
export async function decrypt(password, envelope) {
  if (envelope.v !== 1 || envelope.kdf !== "PBKDF2" || envelope.hash !== "SHA-256") throw new Error("unsupported envelope");
  const key = await deriveKey(password, fromB64(envelope.salt), envelope.iterations, ["decrypt"]);
  let plain;
  try {
    plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(envelope.iv) }, key, fromB64(envelope.ct));
  } catch {
    throw new Error("wrong password or corrupted data");
  }
  return JSON.parse(dec.decode(plain));
}
