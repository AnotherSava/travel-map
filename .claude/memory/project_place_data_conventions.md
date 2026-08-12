---
name: project_place_data_conventions
description: "travel-map place curation: hand-pin a coordinate in coords_cache.json, use a parenthetical alias when Mapbox spells the name differently, and always give a new city a ranks.json entry"
metadata:
  type: project
---

Three things about adding a place that the repo docs don't spell out, learned adding
Whistler and Swemeh (2026-08-11):

**Pin the coordinate when the visit wasn't the settlement centre.** Pre-seed
`coords_cache.json` under the exact geocode query (`"<name-without-parenthetical>,
<region?>, <country>"`) and the build never calls Nominatim for it — confirmed when the
run reports all hits and `0 new`. This is how Swemeh sits on the Dead Sea Spa Resort on
the shore rather than on the village a few km inland.

**When the base map spells the name differently, put its spelling in parentheses.**
`cityNameVariants` splits `"Swemeh (Suwaymah)"` into both forms, and that one change does
two jobs: the base style's own label for the place is suppressed (no more two spellings of
one settlement on screen), and the harvested `symbolrank` matches. Price: the parenthetical
shows in the star label and the popup, so it's a real trade — ask rather than assume.

**A city with no `ranks.json` entry falls back to `DEFAULT_RANK` 9** and draws at
major-city size — conspicuous for a village. Always harvest the real rank (see
[[project_browser_verification]]) and commit it alongside the city.

Removing a place touches four files: `visited.json`, `ranks.json`, `coords_cache.json`,
and the regenerated `places.geojson` — plus `visits.enc` if it had a visit entry.
Format reference lives in `docs/input-format.md`; see [[project_mapbox_renderer]] for the
renderer itself.
