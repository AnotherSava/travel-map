# Project memory — travel-map

- [Mapbox renderer](project_mapbox_renderer.md) — Mapbox GL JS v3, single customized Streets style; dev token (Doppler `dev`) → generated web/config.js, prod token in Doppler `prd`; Standard 3D excluded
- [Hosting](project_travel_map_hosting.md) — Cloudflare Pages at anothersava.com/travel; **publishing is CI-only** (push to main runs `.github/workflows/publish.yml`), `! deploy` = local server on :8000; Doppler configs dev/prd/**ci** (ci deliberately can't read the visits password); `.env` deleted
- [Password-gated visits](project_travel_map_hosting.md) — enriched visit log encrypted client-side; plaintext `web/data/visits.source.json` gitignored, ciphertext `web/data/visits.enc` committed+shipped, `TRAVEL_VISITS_PASSWORD` (canonical in travel-map/prd, referenced from dev) unlocks in-browser; format in docs/input-format.md
