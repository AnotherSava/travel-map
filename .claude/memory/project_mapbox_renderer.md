---
name: project_mapbox_renderer
description: "travel-map renders with Mapbox GL JS (dev MAPBOX_TOKEN in Doppler travel-map/dev → generated web/config.js; prod token in travel-map/prd); single customized Streets style, Standard 3D excluded"
metadata: 
  node_type: memory
  type: project
  modified: 2026-08-06T00:26:24.379Z
---

The web map uses **Mapbox GL JS v3** (switched from MapLibre + MapTiler on
2026-06-17). The Mapbox token is split by environment, both halves in Doppler: the **dev**
token (`MAPBOX_TOKEN` in `travel-map/dev`, restricted to `http://localhost:8000`) is written
into the gitignored `web/config.js` by `scripts/dev.sh` on every local run, and the **prod**
token (`travel-map/prd`, restricted to the live domain) is baked into the bundle by CI at build
time — only `web/config.example.js` (empty token) is committed.
See [[project_travel_map_hosting]] for the publish / token-restriction details.

As of 2026-06-18 it's a **single customized Streets style, no style switcher**: roads
hidden, country borders darkened / region borders lightened, native globe glow,
compact ⓘ attribution (Mapbox logo + attribution kept per TOS). Mapbox **Standard
(3D)** was evaluated and rejected — custom GeoJSON sources won't tile on it (see the
`mapbox-gl-js.md` learning). `window.MAP_STYLE` overrides the style (and skips the
Streets-specific tweaks). The map defaults to the v3 3D globe projection.
