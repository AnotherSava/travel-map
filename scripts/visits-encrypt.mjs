#!/usr/bin/env node
// Encrypt the owner-only plaintext trip log into the committed, shipped envelope.
//
//   web/data/visits.source.json  (gitignored plaintext)  ->  web/data/visits.enc  (committed ciphertext)
//
// Run after editing the source, then `git add web/data/visits.enc`:
//   doppler run -p travel-map -c dev -- node scripts/visits-encrypt.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encrypt } from "./crypto/envelope.mjs";
import { resolvePassword } from "./crypto/password.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = resolve(ROOT, "web/data/visits.source.json");
const ENC = resolve(ROOT, "web/data/visits.enc");

const source = JSON.parse(readFileSync(SOURCE, "utf8"));
const password = await resolvePassword();
const envelope = await encrypt(password, source);
writeFileSync(ENC, JSON.stringify(envelope, null, 2) + "\n");
console.log(`Encrypted ${Object.keys(source).length} cit${Object.keys(source).length === 1 ? "y" : "ies"} -> web/data/visits.enc`);
