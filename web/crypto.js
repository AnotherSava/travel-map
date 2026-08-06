"use strict";

// Browser-side decryption of the password-gated visits envelope. Mirror of
// scripts/crypto/envelope.mjs decrypt() (the two can't share a file — this loads
// as a plain script, that's an ESM module); keep the deriveKey/decrypt shapes in
// sync. Exposes window.decryptVisits(password) -> { "<city>|<cc>": Visit[] },
// throwing on a wrong password. Needs a secure context (HTTPS or localhost) —
// crypto.subtle is undefined on file:// and insecure origins.
(function () {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  // data/ lives inside web/, alongside places.geojson (see app.js DATA_URL).
  const ENVELOPE_URL = new URL("data/visits.enc", window.location.href).href;

  let cachedEnvelope = null; // fetched once, reused across unlock attempts.

  // Tag failures to load/parse the envelope so the caller can tell them apart
  // from a genuine wrong password (a wrong key throws a plain Error, no code).
  const loadError = (msg) => { const e = new Error(msg); e.code = "LOAD_FAILED"; return e; };

  async function deriveKey(password, salt, iterations) {
    const baseKey = await crypto.subtle.importKey(
      "raw", enc.encode(password.normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
      baseKey, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  }

  window.decryptVisits = async function (password) {
    if (!cachedEnvelope) {
      let res;
      try { res = await fetch(ENVELOPE_URL); } catch { throw loadError("could not load visit data"); }
      if (!res.ok) throw loadError(`could not load visit data (${res.status})`);
      try { cachedEnvelope = await res.json(); } catch { throw loadError("visit data is corrupt"); }
    }
    const env = cachedEnvelope;
    if (env.v !== 1 || env.kdf !== "PBKDF2" || env.hash !== "SHA-256") throw loadError("unsupported envelope");
    const key = await deriveKey(password, fromB64(env.salt), env.iterations);
    let plain;
    try {
      plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(env.iv) }, key, fromB64(env.ct));
    } catch {
      throw new Error("wrong password"); // GCM tag mismatch from a wrong key.
    }
    return JSON.parse(dec.decode(plain));
  };
})();
