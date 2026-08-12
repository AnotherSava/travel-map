# Project memory — travel-map

- [Mapbox renderer](project_mapbox_renderer.md) — Mapbox GL JS v3, single customized Streets style; dev token (Doppler `dev`) → generated web/config.js, prod token in Doppler `prd`; Standard 3D excluded
- [Hosting](project_travel_map_hosting.md) — Cloudflare Pages at anothersava.com/travel; **publishing is CI-only** (push to main runs `.github/workflows/publish.yml`), `! deploy` = local server on :8000; Doppler configs dev/prd/**ci** (ci deliberately can't read the visits password); `.env` deleted
- [Password-gated visits](project_travel_map_hosting.md) — enriched visit log encrypted client-side; plaintext `web/data/visits.source.json` gitignored, ciphertext `web/data/visits.enc` committed+shipped, `TRAVEL_VISITS_PASSWORD` (canonical in travel-map/prd, referenced from dev) unlocks in-browser; format in docs/input-format.md
- [Browser verification](project_browser_verification.md) — check map changes via chrome-devtools MCP on a self-launched headless Chrome; claude-in-chrome screenshots are permanently wedged here; harvest a new city's `rank` from `placesData` in the page
- [Place data conventions](project_place_data_conventions.md) — hand-pin a coordinate in `coords_cache.json`; a parenthetical alias suppresses the base map's own label and matches the rank key; never leave a new city without a `ranks.json` entry
