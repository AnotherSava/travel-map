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

Each **city object**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | City name. Shown verbatim in the popup; also geocoded (see below). |
| `region` | string | no | Intermediate level — state, province, oblast, etc. Disambiguates geocoding and is shown in the popup. Omit when not needed. |

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
    "cities": [
      { "name": "Bruges (Brugge)", "region": "West Flanders" }
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

- **Parenthetical suffixes are stripped before geocoding.** `"Bruges (Brugge)"` is geocoded
  as `"Bruges"` but still displayed in full in the popup. Use this for local-language or
  alternate names that would otherwise confuse the geocoder.
- **`region` is optional but recommended** when a name is ambiguous (e.g. multiple
  "Springfield"s) or when the country has a strong state/province level.

## Output and the geocode cache

Running the build step produces two files next to the input:

- `web/data/coords_cache.json` — a `{ "<query string>": [lng, lat] }` map. The query string
  is exactly the joined query described above. This file is **committed and hand-editable**:
  if the geocoder places a city wrong, edit its coordinate here and re-run; cached entries
  are never re-fetched, so re-runs are instant.
- `web/data/places.geojson` — one GeoJSON Point feature per city, with properties
  `{ city, country, region }` (`region` is `null` when omitted). This is what the web app
  loads.

## Notes

- The file is generic: it describes any list of cities, not just "places visited" — the same
  format works for, say, every city with a given restaurant chain.
- Producing/seeding `visited.json` itself is out of scope for the map build; a small sample
  is committed so the pipeline runs out of the box.
