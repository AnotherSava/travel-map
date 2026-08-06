# Visited-places world map

An interactive world map (zoom/pan) that plots a set of cities, each rendered as a
**star** (green by default, or a per-city/per-country color set in the input) and
clustered when zoomed out. Click a star for the city name; click a cluster to zoom in.
When unlocked with a password (the top-right lock control), each star also shows that
city's trip log — dates, activities, and comments — kept encrypted otherwise.

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
disambiguate geocoding, and an optional `color` (also settable on the country, applying to
all its cities) overriding the default green star. Producing this file is out of scope here;
the committed `visited.json` holds the actual visited-places list.

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

Per-city **trip details** (dates, activities, comments) are not part of `visited.json` — they
live in a separate, encrypted, password-gated source, shown on the map only after the owner
enters a password. See [Enriched visit log](docs/input-format.md#enriched-visit-log-encrypted).

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
│   ├── build_geojson.py     # writes into web/data/
│   ├── build_site.mjs       # stages web/ → dist/travel/ for deploy
│   ├── crypto/              # shared PBKDF2 + AES-GCM envelope (Node ESM)
│   ├── visits-encrypt.mjs   # visits.source.json → visits.enc
│   └── visits-decrypt.mjs   # visits.enc → visits.source.json (fresh clone)
└── web/                     # the deployable bundle
    ├── index.html           # loads Mapbox GL JS from CDN
    ├── app.js               # star layer, star color, popups, lock control, Streets tweaks
    ├── crypto.js            # in-browser decrypt of visits.enc (mirror of scripts/crypto)
    ├── style.css
    ├── config.example.js    # template for the Mapbox token
    └── data/
        ├── visited.json      # INPUT: countries → cities (+ optional region, color)
        ├── coords_cache.json # geocode cache (committed, hand-editable)
        ├── ranks.json        # label-prominence cache (committed, hand-editable)
        ├── places.geojson    # generated; consumed by the web app
        └── visits.enc        # encrypted trip log (committed, shipped; in-browser unlock)
```

## Hosting

The site is published to **Cloudflare Pages** under a `/travel` subpath. Secrets are managed
with [Doppler](https://www.doppler.com/) (project `travel-map`, config `dev`) and injected at
build/deploy time via `doppler run`, so nothing sensitive is written to disk:

- `MAPBOX_TOKEN` — production Mapbox token, URL-restricted to the live domain.
- `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` — referenced from a shared `tools` Doppler
  project, so one Cloudflare token covers every site.
- `TRAVEL_VISITS_PASSWORD` — unlocks the encrypted visit log (also used by the visits scripts).

A staging step prepares a deployable `dist/`:

```bash
doppler run -p travel-map -c dev -- node scripts/build_site.mjs
```

This copies `web/` → `dist/travel/` (so the map serves under `/travel/`), generates
`dist/travel/config.js` from `MAPBOX_TOKEN`, content-hashes the local assets for cache-busting,
and writes `dist/_redirects` pointing the site root at `/travel/`. It refuses to build if
`web/data/visits.enc` is older than a locally-edited `visits.source.json`.

Deploy the staged folder with Wrangler (direct upload); `doppler run` supplies the Cloudflare
credentials:

```bash
doppler run -p travel-map -c dev -- npx wrangler pages deploy dist --project-name <project> --branch main
```

`web/` stays a self-contained static bundle, so it can also be dropped onto any other static
host as-is. (`.env.example` lists the same variables for anyone preferring a local `.env` with
`node --env-file=.env` over Doppler.)
