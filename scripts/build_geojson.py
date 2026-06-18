#!/usr/bin/env python3
"""Geocode the visited-cities input into the GeoJSON the web map consumes.

Reads ``data/visited.json`` (countries -> cities, each city with an optional
``region`` level), geocodes every city via Nominatim, and writes
``data/places.geojson`` as a FeatureCollection of city points.

Every geocode result is cached in ``data/coords_cache.json`` keyed by the query
string, so re-runs are instant and the committed cache is hand-editable for any
name Nominatim places wrong: fix the coordinate there and re-run.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

from geopy.extra.rate_limiter import RateLimiter
from geopy.geocoders import Nominatim

# City names carry non-ASCII characters; force UTF-8 output so progress prints
# don't crash on Windows consoles that default to a legacy code page.
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "web" / "data"
INPUT_PATH = DATA_DIR / "visited.json"
CACHE_PATH = DATA_DIR / "coords_cache.json"
# Committed cache of each city's Mapbox label prominence, keyed "<city>|<cc>".
# Baked into the output so the web map sizes labels correctly from the first frame
# instead of waiting for its runtime harvest. Hand-editable; regenerate by exploring
# the map (see the web app's harvestCityRanks) and dumping the collected ranks.
RANKS_PATH = DATA_DIR / "ranks.json"
OUTPUT_PATH = DATA_DIR / "places.geojson"

# Nominatim's usage policy requires a descriptive, identifying user agent.
USER_AGENT = "travel-map-visited-places/1.0 (https://github.com/AnotherSava/travel-map)"
# Parenthetical suffixes ("Bruges (Brugge)") confuse the geocoder; strip them.
PAREN_RE = re.compile(r"\s*\([^)]*\)")

# Country name -> ISO 3166-1 alpha-2 code, emitted per feature as ``cc``. The web
# map matches this against the base style's ``iso_3166_1`` so it suppresses the
# base label only for the visited city, not for same-named cities in other
# countries (e.g. London, GB vs London, CA). Building errors on any country not
# listed here, so a newly added country surfaces immediately instead of silently
# losing its label suppression.
COUNTRY_ISO = {
    "Andorra": "AD", "Austria": "AT", "Azerbaijan": "AZ", "Belarus": "BY",
    "Belgium": "BE", "Bulgaria": "BG", "Canada": "CA", "Croatia": "HR",
    "Cyprus": "CY", "Czech Republic": "CZ", "Egypt": "EG", "Estonia": "EE",
    "Finland": "FI", "France": "FR", "Georgia": "GE", "Germany": "DE",
    "Greece": "GR", "Hungary": "HU", "Israel": "IL", "Italy": "IT",
    "Japan": "JP", "Jordan": "JO", "Montenegro": "ME", "Philippines": "PH",
    "Poland": "PL", "Russia": "RU", "Slovakia": "SK", "Spain": "ES",
    "Sri Lanka": "LK", "Switzerland": "CH", "Thailand": "TH", "Tunisia": "TN",
    "Turkey": "TR", "Ukraine": "UA", "United Kingdom": "GB",
    "United States": "US", "Vatican City": "VA",
}


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def write_json(path: Path, data: Any, sort_keys: bool = False) -> None:
    with path.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2, sort_keys=sort_keys)
        fh.write("\n")


def geocode_query(name: str, region: str | None, country: str) -> str:
    """Build the ``"<name>, <region?>, <country>"`` query used as the cache key.

    Parenthetical suffixes are stripped from both name and region for the query
    (e.g. a region like ``"Saint Petersburg (federal city)"`` otherwise confuses
    the geocoder); the original values are still kept for display.
    """
    clean_name = PAREN_RE.sub("", name).strip()
    clean_region = PAREN_RE.sub("", region).strip() if region else ""
    parts = [clean_name] + ([clean_region] if clean_region else []) + [country]
    return ", ".join(parts)


def main() -> int:
    if not INPUT_PATH.exists():
        print(f"error: input not found: {INPUT_PATH}", file=sys.stderr)
        return 1

    countries = load_json(INPUT_PATH)
    cache: dict[str, list[float]] = load_json(CACHE_PATH) if CACHE_PATH.exists() else {}
    ranks: dict[str, int] = load_json(RANKS_PATH) if RANKS_PATH.exists() else {}

    geolocator = Nominatim(user_agent=USER_AGENT, timeout=10)
    geocode = RateLimiter(geolocator.geocode, min_delay_seconds=1, max_retries=3, error_wait_seconds=5.0)

    features: list[dict[str, Any]] = []
    hits = misses = failures = 0
    unresolved: list[str] = []

    for entry in countries:
        country = entry["country"]
        if country not in COUNTRY_ISO:
            print(f"error: no ISO code mapped for country {country!r}; add it to COUNTRY_ISO", file=sys.stderr)
            return 1
        country_cc = COUNTRY_ISO[country]
        # An optional ``color`` set on the country applies to all its cities; a
        # city-level ``color`` overrides it. Cities with neither are left
        # uncolored and the web map renders them in its default green.
        country_color = entry.get("color")
        for city in entry["cities"]:
            name = city["name"]
            region = city.get("region")
            color = city.get("color", country_color)
            query = geocode_query(name, region, country)

            if query in cache:
                coords = cache[query]
                hits += 1
            else:
                location = geocode(query)
                if location is None:
                    failures += 1
                    unresolved.append(query)
                    print(f"  NOT FOUND: {query}", file=sys.stderr)
                    continue
                coords = [location.longitude, location.latitude]
                cache[query] = coords
                misses += 1
                print(f"  geocoded:  {query} -> {coords}")
                # Persist after each new geocode so a crash (or flaky network)
                # never loses progress and re-runs resume from the cache.
                write_json(CACHE_PATH, cache, sort_keys=True)

            properties: dict[str, Any] = {"city": name, "country": country, "region": region, "cc": country_cc}
            if color:
                properties["color"] = color
            rank = ranks.get(f"{name}|{country_cc}")
            if rank is not None:
                properties["rank"] = rank
            features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": coords},
                "properties": properties,
            })

    write_json(CACHE_PATH, cache, sort_keys=True)
    write_json(OUTPUT_PATH, {"type": "FeatureCollection", "features": features})

    print(f"\n{len(features)} features written to {OUTPUT_PATH.relative_to(ROOT)}")
    print(f"cache: {hits} hit(s), {misses} new, {len(cache)} total -> {CACHE_PATH.relative_to(ROOT)}")
    if unresolved:
        print(f"{failures} city/cities could not be geocoded:", file=sys.stderr)
        for query in unresolved:
            print(f"  - {query}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
