# Input format: `web/data/visited.json`

The build step (`scripts/build_geojson.py`) reads a single JSON file describing the cities
to plot, geocodes each one, and writes `web/data/places.geojson` for the web app. This
document describes that input file.

## Structure

The top level is an **array of country objects**. Each country object groups a set of
cities:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `country` | string | yes | Country name, used both for display and as the last part of the geocoding query. |
| `cities` | array | yes | List of city objects in that country (may be empty). |
| `color` | string | no | Default star color for every city in this country. Any CSS color string (`"#e63946"`, `"tomato"`, `"hsl(210,70%,45%)"`). Overridden per-city by a city-level `color`. Omit to use the map's default green. |

Each **city object**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | City name. Shown verbatim in the popup; also geocoded (see below). |
| `region` | string | no | Intermediate level — state, province, oblast, etc. Disambiguates geocoding and is shown in the popup. Omit when not needed. |
| `color` | string | no | Star color for this city. Any CSS color string. Overrides the country-level `color`; if neither is set, the map's default green is used. |

Per-city trip details (dates, activities, comments) are **not** part of this file — they live in a
separate, encrypted, password-gated source; see [Enriched visit log](#enriched-visit-log-encrypted) below.

## Example

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
  },
  {
    "country": "Belgium",
    "color": "#e63946",
    "cities": [
      { "name": "Bruges (Brugge)", "region": "West Flanders" },
      { "name": "Brussels", "color": "#1d3557" }
    ]
  }
]
```

## How fields are used

For each city the build step constructs a geocoding query by joining, with `", "`:

```
<name>, <region (if present)>, <country>
```

So `Sapporo` above is geocoded as `Sapporo, Hokkaido, Japan`, and `New York` as
`New York, United States`.

- **Parenthetical suffixes are stripped before geocoding** — from both name and region.
  `"Bruges (Brugge)"` is geocoded as `"Bruges"`, and a region like `"Saint Petersburg
  (federal city)"` as `"Saint Petersburg"`; both are still displayed in full in the popup.
  Use this for local-language or alternate names that would otherwise confuse the geocoder.
- **`region` is optional but recommended** when a name is ambiguous (e.g. multiple
  "Springfield"s) or when the country has a strong state/province level.
- **`color` is resolved at build time**: a city-level `color` wins over its country-level
  `color`, which in turn applies to every city in that country. Cities with neither resolved
  color get no `color` property and the web app renders them in its default green. Clusters
  are always shown in a fixed blue, since a cluster can span multiple colors.

## Output and the caches

The build reads two committed, hand-editable cache files and writes one output:

- `web/data/coords_cache.json` — a `{ "<query string>": [lng, lat] }` map. The query string
  is exactly the joined query described above. **Committed and hand-editable**: if the geocoder
  places a city wrong, edit its coordinate here and re-run; cached entries are never re-fetched,
  so re-runs are instant.
- `web/data/ranks.json` — a `{ "<city>|<cc>": <symbolrank> }` map of each city's Mapbox label
  prominence (lower = more prominent), baked into the output as `rank`. The web map sizes each
  label by it, so a prominent city (e.g. Toronto, 6) gets a large label and a minor one (e.g.
  Niagara Falls, 11) a small one — correctly from the first frame. **Committed and hand-editable**:
  a city the geocoder names differently than Mapbox (e.g. "Quebec City" vs "Quebec") can be fixed
  with an entry here. Regenerate by loading the web app and exploring the map — its `harvestCityRanks`
  reads the ranks from the base style's tiles as areas come into view; a city with no entry simply
  falls back to a mid-size default (and the runtime harvest fills it in live).
- `web/data/places.geojson` — one GeoJSON Point feature per city, with properties
  `{ city, country, region, cc }` (`region` is `null` when omitted), plus `color` when a
  resolved color exists and `rank` when one is cached. This artifact is **public**: it carries
  locations only, never trip details. `cc` is the ISO 3166-1 alpha-2 country
  code (derived from `country` via `COUNTRY_ISO` in the build); the web map pairs it with the
  base style's `iso_3166_1` so it suppresses the base label only for the visited city, not
  same-named cities in other countries. A country missing from `COUNTRY_ISO` is a build error.
  This is what the web app loads.

## Enriched visit log (encrypted)

Trip details — when you visited a place, what you did, and any comment — are kept **out of the
public data** and shown on the map only after a password. They live in a separate source file,
encrypted at build time; the browser decrypts them in memory when the owner types the password
into the map's lock control (top-right).

### `web/data/visits.source.json` — owner-only plaintext (gitignored)

An object keyed `"<city>|<cc>"` — the exact `name` from `visited.json` (parentheticals included,
e.g. `"Bruges (Brugge)"`) joined by `|` to the ISO country code, matching the `ranks.json`
convention. Each value is an array of **visit objects**, rendered newest-first in the popup:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `date` | string | no | ISO date at any precision: `"2019"`, `"2019-05"`, or `"2019-05-14"`. Sorts visits (newest first) and renders at its precision (`14 May 2019` / `May 2019` / `2019`). |
| `activities` | array of strings | no | Free-text trip/activity types (`["beach"]`, `["hiking", "food"]`, …), each shown as a pill. Not a fixed vocabulary — any string is accepted and shown as-is. |
| `comment` | string | no | Free text shown under the visit. |

```json
{
  "Kyoto|JP":   [ { "date": "2025-04", "activities": ["temples", "food"] } ],
  "Seattle|US": [ { "date": "2024", "activities": ["conference"], "comment": "rainy but worth it" } ]
}
```

(Example values above are fictional — this doc must never reproduce the real contents of
`visits.source.json`.) This file is **gitignored** — never committed, never shipped. Its only stored form is the
encrypted `web/data/visits.enc`.

### `web/data/visits.enc` — committed ciphertext + shipped artifact

The AES-256-GCM envelope produced from `visits.source.json` by `scripts/visits-encrypt.mjs`
(PBKDF2-HMAC-SHA256, 600k iterations; key derived from the password). It is committed — doubling as
the encrypted backup of the source — and shipped to the site, where `web/crypto.js` decrypts it in
memory after the owner enters the password. Self-describing: `{ v, kdf, hash, iterations, salt, iv, ct }`.

### Owner workflow

The single password lives in Doppler (project `travel-map`, secret `TRAVEL_VISITS_PASSWORD`) and is the
same value a viewer types on the site. Both scripts resolve it via the `TRAVEL_VISITS_PASSWORD` env
var → Doppler → hidden prompt.

```
doppler run -p travel-map -c dev -- node scripts/visits-decrypt.mjs   # restore source on a fresh clone
# edit web/data/visits.source.json
doppler run -p travel-map -c dev -- node scripts/visits-encrypt.mjs   # re-encrypt -> visits.enc
git add web/data/visits.enc
bash scripts/deploy.sh                                          # build_site.mjs blocks a stale visits.enc
```

### Security model — read this

This is **soft, client-side obfuscation, not access control.** The ciphertext ships publicly and is
world-downloadable; anyone can brute-force it offline with no rate limit. Security equals the
password's entropy times the KDF cost — the 600k iterations only slow each guess, they don't rescue
a weak password. It hides trip details from casual viewers, scrapers, and repo browsers; it is **not**
suitable for genuinely sensitive data. Use a randomly generated ~6-word passphrase (≥70 bits) kept in
a password manager. A lost password means the enriched log is unrecoverable (the plaintext is never
committed), and rotation is non-retroactive (the old ciphertext stays in git history).

## Notes

- The file is generic: it describes any list of cities, not just "places visited" — the same
  format works for, say, every city with a given restaurant chain.
- Producing/seeding `visited.json` itself is out of scope for the map build; the committed
  file holds the actual visited-places list.
