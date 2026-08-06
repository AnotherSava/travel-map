#!/usr/bin/env node
// Restore the owner-only plaintext trip log from the committed envelope — e.g. on a
// fresh clone, where visits.source.json is absent (gitignored).
//
//   web/data/visits.enc  (committed ciphertext)  ->  web/data/visits.source.json  (gitignored plaintext)
//
//   doppler run -p travel-map -c dev -- node scripts/visits-decrypt.mjs
//
// The written source's mtime is stamped from the envelope so build_site.mjs's
// staleness guard doesn't immediately flag the fresh source as "newer".
import { readFileSync, writeFileSync, statSync, utimesSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decrypt } from "./crypto/envelope.mjs";
import { resolvePassword } from "./crypto/password.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = resolve(ROOT, "web/data/visits.source.json");
const ENC = resolve(ROOT, "web/data/visits.enc");

const envelope = JSON.parse(readFileSync(ENC, "utf8"));
const password = await resolvePassword();
const data = await decrypt(password, envelope);
writeFileSync(SOURCE, JSON.stringify(data, null, 2) + "\n");
// Stamp the restored source a second BEHIND the envelope so build_site.mjs's
// staleness guard (source newer than enc) doesn't false-fire on a fresh decrypt.
// Filesystem mtime resolution can't always reproduce enc's exact sub-millisecond
// value, so matching it precisely occasionally lands a hair newer; -1s is
// unambiguous, and a later real edit still reads as newer than the envelope.
const behind = new Date(statSync(ENC).mtimeMs - 1000);
utimesSync(SOURCE, behind, behind);
console.log(`Decrypted -> web/data/visits.source.json (${Object.keys(data).length} cities)`);
