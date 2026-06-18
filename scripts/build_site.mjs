// Stages the static bundle for deployment under the /travel subpath.
//
//   web/  ──>  dist/travel/        (the deployable map, served at /travel/)
//   dist/_redirects                (apex  /  ->  /travel/)
//   dist/travel/config.js          (generated from $MAPBOX_TOKEN; never committed)
//
// Usage:  MAPBOX_TOKEN=pk.xxx node scripts/build_site.mjs
// Then deploy dist/ to Cloudflare Pages (direct upload).

import { rmSync, mkdirSync, cpSync, writeFileSync } from "node:fs";
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

rmSync(dist, { recursive: true, force: true });
mkdirSync(travel, { recursive: true });

// Copy web/ verbatim, minus the local (gitignored) config — we regenerate it below.
cpSync(join(root, "web"), travel, {
  recursive: true,
  filter: (src) => !src.endsWith("config.js"),
});

const style = process.env.MAP_STYLE;
const config = [
  `window.MAPBOX_TOKEN = ${JSON.stringify(token)};`,
  ...(style ? [`window.MAP_STYLE = ${JSON.stringify(style)};`] : []),
  "",
].join("\n");
writeFileSync(join(travel, "config.js"), config);

writeFileSync(join(dist, "_redirects"), "/    /travel/    302\n");

console.log(`Built dist/ — map at dist/travel/, apex redirects to /travel/.`);
