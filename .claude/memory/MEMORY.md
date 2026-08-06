# Project memory — travel-map

- [Mapbox renderer](project_mapbox_renderer.md) — Mapbox GL JS v3, single customized Streets style; dev token in web/config.js, prod MAPBOX_TOKEN in Doppler travel-map/dev; Standard 3D excluded
- [Hosting](project_travel_map_hosting.md) — Cloudflare Pages at anothersava.com/travel; deploy `doppler run -p travel-map -c dev -- bash scripts/deploy.sh`; secrets in Doppler (Cloudflare token+account shared in `tools`, referenced); `.env` deleted
- [Password-gated visits](project_travel_map_hosting.md) — enriched visit log encrypted client-side; plaintext `web/data/visits.source.json` gitignored, ciphertext `web/data/visits.enc` committed+shipped, `TRAVEL_VISITS_PASSWORD` (travel-map/dev) unlocks in-browser; format in docs/input-format.md
