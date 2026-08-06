// Stages the static bundle for deployment under the /travel subpath.
//
//   web/  ──>  dist/travel/        (the deployable map, served at /travel/)
//   dist/_redirects                (apex  /  ->  /travel/)
//   dist/travel/config.js          (generated from $MAPBOX_TOKEN; never committed)
//
// Usage:  MAPBOX_TOKEN=pk.xxx node scripts/build_site.mjs
// Then deploy dist/ to Cloudflare Pages (direct upload).

import { rmSync, mkdirSync, cpSync, writeFileSync, readFileSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const travel = join(dist, "travel");

const token = process.env.MAPBOX_TOKEN;
if (!token) {
  console.error("MAPBOX_TOKEN is not set — refusing to build a tokenless bundle.");
  process.exit(1);
}

// Refuse to ship a stale ciphertext: if the owner edited the plaintext trip source
// but didn't re-run visits-encrypt, the committed visits.enc would be out of date.
// The source is gitignored (owner machines only), so on CI / a fresh clone it's
// absent and this no-ops. visits-decrypt stamps the source's mtime from the
// envelope, so a fresh decrypt-for-edit doesn't trip this.
const visitsSource = join(root, "web", "data", "visits.source.json");
const visitsEnc = join(root, "web", "data", "visits.enc");
if (existsSync(visitsSource) && existsSync(visitsEnc) && statSync(visitsSource).mtimeMs > statSync(visitsEnc).mtimeMs) {
  console.error("web/data/visits.source.json is newer than web/data/visits.enc — run `doppler run -p travel-map -c dev -- node scripts/visits-encrypt.mjs` before deploying.");
  process.exit(1);
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(travel, { recursive: true });

// Copy web/ verbatim, minus the local (gitignored) config — we regenerate it below —
// and minus the plaintext trip source, which must never reach the public bundle
// (cpSync copies on-disk files, gitignored or not; only visits.enc ships).
cpSync(join(root, "web"), travel, {
  recursive: true,
  filter: (src) => !src.endsWith("config.js") && !src.endsWith("visits.source.json"),
});

const style = process.env.MAP_STYLE;
const config = [
  `window.MAPBOX_TOKEN = ${JSON.stringify(token)};`,
  ...(style ? [`window.MAP_STYLE = ${JSON.stringify(style)};`] : []),
  "",
].join("\n");
writeFileSync(join(travel, "config.js"), config);

// Cache-bust local assets: Cloudflare serves CSS/JS with a 4h max-age, so an edit
// wouldn't show until that expired (or a hard refresh). Append a content hash to
// each local asset reference in index.html; the HTML always revalidates
// (max-age=0), so a normal refresh picks up a new hash the instant an asset changes.
const indexPath = join(travel, "index.html");
let html = readFileSync(indexPath, "utf8");
for (const asset of ["style.css", "config.js", "crypto.js", "app.js"]) {
  const hash = createHash("sha1").update(readFileSync(join(travel, asset))).digest("hex").slice(0, 8);
  const ref = asset.replace(/[.]/g, "\\.");
  html = html.replace(new RegExp(`((?:href|src)=")${ref}(")`, "g"), `$1${asset}?v=${hash}$2`);
}
writeFileSync(indexPath, html);

writeFileSync(join(dist, "_redirects"), "/    /travel/    302\n");

console.log(`Built dist/ — map at dist/travel/, apex redirects to /travel/.`);
