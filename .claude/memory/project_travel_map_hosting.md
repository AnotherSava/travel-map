---
name: project_travel_map_hosting
description: travel-map is hosted on Cloudflare Pages at anothersava.com/travel; publishing is CI-only (push to main), `! deploy` runs it locally on :8000, all secrets in Doppler (dev / prd / ci configs)
metadata: 
  node_type: memory
  type: project
  modified: 2026-08-06T00:26:12.292Z
---

The site is hosted on **Cloudflare Pages** (project `travel-map`) at
**https://anothersava.com/travel/**; the apex `anothersava.com` 302-redirects to
`/travel/`. The domain's DNS lives at Cloudflare (proxied apex CNAME → the project's
`*.pages.dev`).

**Build:** `node scripts/build_site.mjs` stages `web/` → `dist/travel/`, generates
`dist/travel/config.js` from `$MAPBOX_TOKEN`, and content-hashes local assets into `?v=` refs in
`index.html`; it skips the gitignored `web/config.js` and `web/data/visits.source.json`.

**Two verbs.** Local and external are deliberately separate:
- **`! deploy`** → local server on port 8000 via the deploy skill's dev-server target, whose
  `DEV_CMD` is this repo's committed `scripts/dev.sh` (it refreshes `web/config.js` from Doppler
  `dev` before serving). Config in `config/deploy.env`, wrapper `scripts/deploy.sh` — both
  per-machine and gitignored.
- **Publishing is CI-only** — `.github/workflows/publish.yml` on push to `main`. There is no
  publish skill and no local publish path, by design: a local upload ships the working tree while
  wrangler stamps local HEAD, and it lets the wrong Doppler config bake a non-production token
  into the bundle. Both caused real outages here. To ship, push to `main`.

(`release` is a third verb — tag → CI → GitHub Release — and doesn't apply to this project.)

**Secrets live in Doppler, not `.env`** (migrated 2026-08-06; the local `.env` was deleted).
Three configs, each with a distinct job:
- **`prd`** — source of truth: production `MAPBOX_TOKEN`, `CLOUDFLARE_API_TOKEN`,
  `CLOUDFLARE_ACCOUNT_ID`, `TRAVEL_VISITS_PASSWORD`.
- **`dev`** — local work: the localhost `MAPBOX_TOKEN`, plus a cross-config reference
  `${travel-map.prd.TRAVEL_VISITS_PASSWORD}` so the two can't drift and fail to decrypt the same
  envelope.
- **`ci`** — the publish workflow only: references to `prd`'s `MAPBOX_TOKEN` and the two
  Cloudflare values, and **deliberately not the visits password**. The build never needs it
  (`visits.enc` ships pre-encrypted) and the ciphertext is public in this repo, so the password
  is the only thing protecting the trip log — keeping it out of CI shrinks the blast radius of a
  leaked token. GitHub holds a Doppler **service token scoped to `ci`** (read-only, revocable) as
  the repo secret `DOPPLER_TOKEN`. Because a service token resolves to exactly one config,
  `doppler run` in CI takes no `-p`/`-c` — there is no argument left to get wrong.

`.env.example` is still the committed template.

**Two Mapbox tokens** (both plain public tokens, identical scopes — only URL restrictions
differ), one per Doppler config: `prd` restricted to `https://anothersava.com`, `dev` to
`http://localhost:8000`. Mapbox restrictions take no wildcards or port ranges, so the local
port is exact — `scripts/dev.sh` pins 8000 for this reason, and regenerates the gitignored
`web/config.js` from `travel-map/dev` before serving.

**The 2026-08-06 outage:** the layout moved to this dev/prd split while the deploy path still
said `-c dev`, so a build baked the localhost-only token into production and the live map went
blank at every zoom — while the style JSON still loaded and the token still validated, which
makes it look like anything but a token problem. If the live map is ever blank, check which
config the last build used first.

See [[project_mapbox_renderer]]; deploy/token mechanics are in the `cloudflare-pages-deploy.md`
and `mapbox-gl-js.md` learnings.
