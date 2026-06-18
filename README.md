# Visited-places world map

An interactive world map (zoom/pan) that plots a set of cities, each rendered as a
**star** colored by country and clustered when zoomed out. Click a star for the city
name; click a cluster to zoom in.

The project is generic: it reads cities from an input file and displays them. The
current use case is "places I've visited," but it works identically for any city list
(e.g. every city with a Burger King).

## How it works

Two parts:

1. A small Python **build step** geocodes the input into a GeoJSON file.
2. A static **Mapbox GL JS** web app renders that GeoJSON.

```
web/data/visited.json  ──(scripts/build_geojson.py)──>  web/data/places.geojson  ──> map
```

## Input

`web/data/visited.json` — a list of countries, each with cities. A city may carry an
optional intermediate `region` level (state / province / etc.) used for display and to
disambiguate geocoding. Producing this file is out of scope here; the committed
`visited.json` holds the actual visited-places list.

```json
[
  { "country": "Japan", "cities": [
    { "name": "Tokyo" },
    { "name": "Sapporo", "region": "Hokkaido" }
  ] }
]
```

A parenthetical suffix is stripped before geocoding only (`"Bruges (Brugge)"` is
geocoded as `"Bruges"` but still displayed in full).

See [docs/input-format.md](docs/input-format.md) for the full schema, field semantics, and
geocode-cache details.

## Build

```bash
python -m venv .venv
# Windows:        .venv\Scripts\activate
# macOS / Linux:  source .venv/bin/activate
pip install -r scripts/requirements.txt
python scripts/build_geojson.py
```

This geocodes each city via Nominatim (free, no key, rate-limited to 1 request/sec) and
writes:

- `web/data/coords_cache.json` — `{ "City, Region, Country": [lng, lat] }`, committed and
  **hand-editable**: if Nominatim places a city wrong, fix its coordinate here and
  re-run. Cached queries are not re-fetched, so re-runs are instant.
- `web/data/places.geojson` — one Point feature per city, consumed by the web app.

## Run locally

Serve from `web/`:

```bash
cd web
python -m http.server 8000
```

Then open <http://localhost:8000/>.

> Fetching the GeoJSON needs `http://`, not `file://`, so opening `index.html` directly
> won't work.

### Base maps

The base map uses [Mapbox](https://account.mapbox.com/), so it needs a free access
token. Get one (Tokens), then:

```bash
cp web/config.example.js web/config.js   # then paste your token into config.js
```

The map renders a single, customized Mapbox **Streets** globe — roads hidden and
country/region borders sharpened. Without a token the app shows a prompt instead of a map.

`web/config.js` is gitignored. You can override the style with any Mapbox style URL via
`window.MAP_STYLE` (which also skips the Streets-specific customizations).

## Project layout

```
.
├── scripts/
│   ├── requirements.txt
│   └── build_geojson.py     # writes into web/data/
└── web/                     # the deployable bundle
    ├── index.html           # loads Mapbox GL JS from CDN
    ├── app.js               # clustered star layer, color-by-country, popups, Streets tweaks
    ├── style.css
    ├── config.example.js    # template for the Mapbox token
    └── data/
        ├── visited.json     # INPUT: countries → cities (+ optional region)
        ├── coords_cache.json # geocode cache (committed, hand-editable)
        └── places.geojson   # generated; consumed by the web app
```

## Hosting

Deferred. The `web/` directory is a self-contained static bundle (it includes
`web/data/`), so it can be dropped onto any static host as-is.
