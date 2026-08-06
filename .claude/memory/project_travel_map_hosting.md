---
name: project_travel_map_hosting
description: travel-map is hosted on Cloudflare Pages at anothersava.com/travel; deploy via `doppler run`, all secrets in Doppler (Cloudflare creds shared in the tools project)
metadata: 
  node_type: memory
  type: project
  modified: 2026-08-06T00:26:12.292Z
---

The site is hosted on **Cloudflare Pages** (project `travel-map`) at
**https://anothersava.com/travel/**; the apex `anothersava.com` 302-redirects to
`/travel/`. The domain's DNS lives at Cloudflare (proxied apex CNAME → the project's
`*.pages.dev`).

**Build:** `node scripts/build_site.mjs` (this is `config/deploy.env`'s `BUILD_CMD` — no
`--env-file` anymore) stages `web/` → `dist/travel/` and generates `dist/travel/config.js`
from `$MAPBOX_TOKEN`; it skips the gitignored local `web/config.js` and `web/data/visits.source.json`.
**Deploy:** `doppler run -p travel-map -c dev -- bash scripts/deploy.sh` — wrangler direct
upload via the global deploy skill's `deploy-cloudflare-pages.sh`. `config/deploy.env`
(globally gitignored) holds the deploy config; `scripts/deploy.sh` is a gitignored wrapper.

**Secrets live in Doppler, not `.env`** (migrated 2026-08-06; the local `.env` was deleted).
`doppler run` injects them: `MAPBOX_TOKEN` is in project `travel-map` config `dev`; the shared
`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` live in project `tools` config `dev` and are
pulled into `travel-map/dev` via cross-project secret references (`${tools.dev.CLOUDFLARE_API_TOKEN}`,
`${tools.dev.CLOUDFLARE_ACCOUNT_ID}`), so the Cloudflare token rotates in one place (`tools`).
`TRAVEL_VISITS_PASSWORD` (also `travel-map/dev`) gates the encrypted visit log (`web/data/visits.enc`;
see `docs/input-format.md`). `.env.example` is still the committed template.

**Two Mapbox tokens** (both plain public tokens, identical scopes — only URL restrictions
differ): prod restricted to `https://anothersava.com`, as `MAPBOX_TOKEN` in Doppler `travel-map/dev`
(baked into the build); dev restricted to `http://localhost`, in gitignored `web/config.js`
(used by the local `python -m http.server` preview).

See [[project_mapbox_renderer]]; deploy/token mechanics are in the `cloudflare-pages-deploy.md`
and `mapbox-gl-js.md` learnings.
