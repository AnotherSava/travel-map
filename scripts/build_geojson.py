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

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "web" / "data"
INPUT_PATH = DATA_DIR / "visited.json"
CACHE_PATH = DATA_DIR / "coords_cache.json"
OUTPUT_PATH = DATA_DIR / "places.geojson"

# Nominatim's usage policy requires a descriptive, identifying user agent.
USER_AGENT = "travel-map-visited-places/1.0 (https://github.com/AnotherSava/travel-map)"
# Parenthetical suffixes ("Bruges (Brugge)") confuse the geocoder; strip them.
PAREN_RE = re.compile(r"\s*\([^)]*\)")


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def write_json(path: Path, data: Any, sort_keys: bool = False) -> None:
    with path.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2, sort_keys=sort_keys)
        fh.write("\n")


def geocode_query(name: str, region: str | None, country: str) -> str:
    """Build the ``"<name>, <region?>, <country>"`` query used as the cache key."""
    clean_name = PAREN_RE.sub("", name).strip()
    parts = [clean_name] + ([region] if region else []) + [country]
    return ", ".join(parts)


def main() -> int:
    if not INPUT_PATH.exists():
        print(f"error: input not found: {INPUT_PATH}", file=sys.stderr)
        return 1

    countries = load_json(INPUT_PATH)
    cache: dict[str, list[float]] = load_json(CACHE_PATH) if CACHE_PATH.exists() else {}

    geolocator = Nominatim(user_agent=USER_AGENT)
    geocode = RateLimiter(geolocator.geocode, min_delay_seconds=1, max_retries=2, error_wait_seconds=5.0)

    features: list[dict[str, Any]] = []
    hits = misses = failures = 0
    unresolved: list[str] = []

    for entry in countries:
        country = entry["country"]
        for city in entry["cities"]:
            name = city["name"]
            region = city.get("region")
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

            features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": coords},
                "properties": {"city": name, "country": country, "region": region},
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
