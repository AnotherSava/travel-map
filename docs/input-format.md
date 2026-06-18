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
  resolved color exists and `rank` when one is cached. `cc` is the ISO 3166-1 alpha-2 country
  code (derived from `country` via `COUNTRY_ISO` in the build); the web map pairs it with the
  base style's `iso_3166_1` so it suppresses the base label only for the visited city, not
  same-named cities in other countries. A country missing from `COUNTRY_ISO` is a build error.
  This is what the web app loads.

## Notes

- The file is generic: it describes any list of cities, not just "places visited" — the same
  format works for, say, every city with a given restaurant chain.
- Producing/seeding `visited.json` itself is out of scope for the map build; the committed
  file holds the actual visited-places list.
