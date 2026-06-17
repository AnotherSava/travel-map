# Plan: Visited-places world map (travel project)

## Context

Goal: an interactive world map (zoom/pan) that plots a set of cities, each rendered as a
**star**, served eventually as a web page. The project is generic — it reads cities from an
input file and displays them; the current use case is "places I've visited," but it would work
identically for any city list (e.g. cities with a Burger King).

Input is a JSON file, assumed already present at `data/visited.json`: a list of countries, each
with cities, where every city may carry an optional intermediate level (state / province /
region) used for display and to disambiguate geocoding. Producing/seeding that file is handled
by a **separate plan** and is out of scope here.

### Decisions (confirmed)
- **Markers**: one **star per city**, clustered when zoomed out, colored by country, click → city name.
- **Map service**: **MapLibre GL JS** with free vector tiles.
- **Input**: a committed JSON file of countries/cities with an optional region level.
- **Hosting**: local only for now; hosted later as a host-agnostic static bundle.

## Approach

Two parts: a small Python **build step** (geocodes the input into a GeoJSON the browser reads)
and a static **MapLibre web app** that renders it.

### Input schema (`data/visited.json`)
```json
[
  {
    "country": "Japan",
    "cities": [
      { "name": "Tokyo" },
      { "name": "Sapporo", "region": "Hokkaido" }
    ]
  },
  {
    "country": "United States",
    "cities": [
      { "name": "Seattle", "region": "Washington" },
      { "name": "New York" }
    ]
  }
]
```
- `region` is the optional intermediate level (state/province/etc.); omit it when not needed.

### Project layout
```
.
├── README.md
├── .gitignore                 # web/config.js, __pycache__, .venv, etc.
├── data/
│   ├── visited.json           # INPUT (assumed present): countries → cities (+ optional region)
│   ├── coords_cache.json      # { "City, Region, Country": [lng, lat] } — geocode cache, committed
│   └── places.geojson         # generated FeatureCollection of city points (consumed by web app)
├── scripts/
│   ├── requirements.txt       # geopy
│   └── build_geojson.py       # geocode cities → coords_cache.json + places.geojson
└── web/
    ├── index.html             # loads MapLibre GL JS from CDN
    ├── app.js                 # map, clustered star layer, color-by-country, popups
    ├── style.css
    ├── config.example.js      # MAPTILER_KEY = ""  (template, committed)
    └── config.js              # real key — GITIGNORED (optional; falls back to demotiles)
```

### 1. Build step — `scripts/build_geojson.py`
- Read `data/visited.json`.
- For each city, strip any parenthetical suffix for geocoding (`"Bruges (Brugge)"` → `"Bruges"`)
  and build the query `"<name>, <region?>, <country>"` (region included when present).
- Geocode with geopy's Nominatim (free, no key; 1 req/sec; descriptive `user_agent`). Cache
  every result in `data/coords_cache.json` keyed by the query string, so re-runs are instant and
  the committed cache is hand-editable for names Nominatim places wrong.
- Emit `data/places.geojson`: one Point feature per city with properties `{ city, country, region }`.

### 2. Web app (static, MapLibre GL JS via CDN)
- **`index.html`**: full-viewport `#map`, MapLibre GL JS + CSS from CDN, then `config.js`
  (if present) and `app.js`.
- **Base style**: if `window.MAPTILER_KEY` is set, use MapTiler's free vector style
  (`https://api.maptiler.com/maps/streets/style.json?key=...`); otherwise fall back to MapLibre
  **demotiles** (`https://demotiles.maplibre.org/style.json`) so the map works with zero signup.
  README documents getting a free MapTiler key for city-level labels.
- **Data**: add `data/places.geojson` as a GeoJSON source with `cluster: true`.
  - Unclustered points: a **symbol layer** using a star icon loaded as an **SDF image**, so
    `icon-color` is data-driven by country via a `match` expression on `country`
    (generated country→color palette). Star per city, colored by country.
  - Clusters: a circle layer sized/labeled by `point_count` (standard MapLibre cluster pattern).
  - Clicking a cluster zooms in; clicking a star opens a popup with the city name (and region/country).
- **`app.js`** fits the initial view to the data bounds and builds a small country→color legend.
- Run locally with `python -m http.server` from `web/` (fetching the geojson needs http://, not file://).

### Key files to create
- `scripts/build_geojson.py`, `scripts/requirements.txt`
- `data/coords_cache.json`, `data/places.geojson` (generated)
- `web/index.html`, `web/app.js`, `web/style.css`, `web/config.example.js`
- `.gitignore`, `README.md`

## Verification
1. `pip install -r scripts/requirements.txt` (in a venv).
2. `python scripts/build_geojson.py` → confirm `data/places.geojson` has one feature per city and
   `coords_cache.json` is populated; eyeball a few coordinates (e.g. Tokyo, Paris, Moscow) for sanity.
3. `cd web && python -m http.server 8000`, open `http://localhost:8000` → world map renders; stars
   appear, cluster when zoomed out, color by country; clicking a star shows the city name; zoom/pan
   work. Verify both with and without a `config.js` MapTiler key (demotiles fallback).
4. Skim for obviously mis-placed stars (geocoding errors), correct them in `coords_cache.json`, and
   re-run `build_geojson.py`.

## Open follow-ups (not in this plan)
- Producing/seeding `data/visited.json` — separate plan.
- Hosting: deferred. Output is a self-contained static bundle (`web/` + `data/places.geojson`)
  deployable to any static host later.
- `git init` for the repo when ready to version it.
