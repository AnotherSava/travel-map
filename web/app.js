"use strict";

// Needs a free Mapbox access token in config.js (window.MAPBOX_TOKEN); without
// one, init() shows a prompt instead of a map.
mapboxgl.accessToken = window.MAPBOX_TOKEN || "";

// Single base map: Mapbox Streets, customized below (roads removed, borders
// sharpened). Override with any Mapbox style via window.MAP_STYLE in config.js.
const STYLE_URL = window.MAP_STYLE || (window.MAPBOX_TOKEN ? "mapbox://styles/mapbox/streets-v12" : undefined);

// Road family in Mapbox styles: surface/bridge/tunnel road lines, links, arrows,
// rails, ferries, and their labels/shields.
const ROAD_LAYER_RE = /road|bridge|tunnel|motorway|street|ferry/i;

// City/town/neighbourhood name layers. We render visited cities' names ourselves
// (paired with the star, see installOverlay); for those cities we filter the base
// style's own settlement label out — otherwise it double-labels and overlaps the
// star (its text has no variable anchor and centers on the point at z>=8, so it
// can't be routed aside). Non-visited cities keep their base labels for context.
const SETTLEMENT_LABEL_RE = /^settlement-.*-label$/;

// data/ lives inside web/, so the whole bundle serves from web/.
const DATA_URL = new URL("data/places.geojson", window.location.href).href;

// Minimal style keeps the app alive (stars still render) when no token is
// configured. Includes a public glyphs source so cluster-count labels work even
// without a base map; a real Mapbox style supplies its own glyphs.
const BLANK_STYLE = { version: 8, glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf", sources: {}, layers: [] };
const map = new mapboxgl.Map({ container: "map", style: STYLE_URL || BLANK_STYLE, center: [0, 20], zoom: 1.4, attributionControl: false });
map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-left");
// Attribution is required (Mapbox + OSM); compact collapses it to an ⓘ button.
map.addControl(new mapboxgl.AttributionControl({ compact: true }));

// Default star color; overridden per-feature by a `color` property set in the
// input JSON (see scripts/build_geojson.py).
const DEFAULT_STAR_COLOR = "#2e8b57";

function drawStar(ctx, cx, cy, points, outer, inner) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / points) * i - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

// A white star on a transparent canvas, added as an SDF image so its color can
// be set per-feature via the `icon-color` paint property. A slight blur turns
// the hard fill into a distance ramp at the edge, which the SDF shader renders
// as smooth, recolorable anti-aliasing.
function makeStarImage(size) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.filter = `blur(${size * 0.03}px)`;
  ctx.fillStyle = "#fff";
  drawStar(ctx, size / 2, size / 2, 5, size * 0.46, size * 0.2);
  ctx.fill();
  return ctx.getImageData(0, 0, size, size);
}

// Reuse whatever fontstack the loaded base style already references, so cluster
// labels render against any provider's glyph set.
function defaultFont() {
  for (const layer of map.getStyle().layers) {
    const font = layer.layout && layer.layout["text-font"];
    if (Array.isArray(font)) return font;
  }
  return ["Noto Sans Regular"];
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Hide every road-family layer in the loaded style for a clean, roadless map.
function hideRoadLayers() {
  for (const layer of map.getStyle().layers) {
    if (ROAD_LAYER_RE.test(layer.id)) map.setLayoutProperty(layer.id, "visibility", "none");
  }
}

// Separator joining a city name to its ISO country code in a match key; no city
// name or 2-letter code contains a pipe, so it can't collide across the join.
const KEY_SEP = "|";

// Lowercased name variants used to match a city against base-map features. The
// `city` value may carry a parenthetical alternate ("Bruges (Brugge)"), so we
// include the full string, the part before the parens, and the part inside them,
// catching either the local or English base label.
function cityNameVariants(city) {
  const variants = new Set([city.toLowerCase()]);
  const outside = city.replace(/\s*\([^)]*\)/g, "").trim();
  if (outside) variants.add(outside.toLowerCase());
  const inside = city.match(/\(([^)]*)\)/);
  if (inside && inside[1].trim()) variants.add(inside[1].trim().toLowerCase());
  return [...variants];
}

// Keys identifying each visited city as "<name><SEP><cc>", matched against the
// base label's "<name><SEP><iso_3166_1>". Pairing the name with the country code
// means we suppress only the visited city, not same-named cities elsewhere
// (London, GB vs London, CA).
function visitedLabelKeys(geojson) {
  const keys = new Set();
  for (const f of geojson.features) {
    const p = f.properties || {};
    const city = p.city, cc = p.cc;
    if (!city || !cc) continue; // no cc: can't disambiguate, leave the base label
    for (const v of cityNameVariants(city)) keys.add(v + KEY_SEP + cc);
  }
  return [...keys];
}

// Per-layer original filters, captured once so re-runs rebuild from the true
// base filter instead of compounding our exclusion onto an already-filtered one.
const baseLabelOriginalFilters = new Map();

// Filter visited cities out of the base settlement label layers, leaving every
// other city labelled. Idempotent: always rebuilt from the captured original.
function hideVisitedBaseLabels(geojson) {
  const keys = visitedLabelKeys(geojson);
  const isVisited = (nameExpr) =>
    ["in", ["concat", ["downcase", nameExpr], KEY_SEP, ["coalesce", ["get", "iso_3166_1"], ""]], ["literal", keys]];
  const exclude = ["!", ["any",
    isVisited(["coalesce", ["get", "name_en"], ["get", "name"], ""]),
    isVisited(["coalesce", ["get", "name"], ""]),
  ]];
  for (const layer of map.getStyle().layers) {
    if (!SETTLEMENT_LABEL_RE.test(layer.id)) continue;
    if (!baseLabelOriginalFilters.has(layer.id)) baseLabelOriginalFilters.set(layer.id, map.getFilter(layer.id) ?? null);
    const original = baseLabelOriginalFilters.get(layer.id);
    map.setFilter(layer.id, original ? ["all", original, exclude] : exclude);
  }
}

// Per-style tweaks for the Streets base map: drop all roads, and sharpen the
// border hierarchy — country borders (admin-0) darker, region borders (admin-1)
// lighter — so countries stand out and lower tiers recede.
function tweakStreets() {
  hideRoadLayers();
  const borderColors = {
    "admin-0-boundary": "hsl(240, 50%, 42%)",
    "admin-0-boundary-disputed": "hsl(240, 50%, 42%)",
    "admin-1-boundary": "hsl(240, 35%, 75%)",
  };
  for (const [id, color] of Object.entries(borderColors)) {
    if (map.getLayer(id)) map.setPaintProperty(id, "line-color", color);
  }
}

// Insertion point for the overlay: the country/continent label layer. Mapbox places
// labels top-down — layers higher in the stack are placed first and win collisions —
// so sitting above the city AND state labels (but below country/continent) gives our
// visited names high priority. They win their spot against base city and state labels
// and appear at the same low zoom as prominent cities, instead of yielding until
// zoomed in, while still ceding to the broadest country/continent labels.
const COUNTRY_LABEL_RE = /^(country|continent)-label$/;
function overlayBeforeId() {
  for (const layer of map.getStyle().layers) {
    if (layer.type === "symbol" && COUNTRY_LABEL_RE.test(layer.id)) return layer.id;
  }
  return undefined; // no country labels: append on top (above city/state labels)
}

// Default prominence for a city whose base-map rank hasn't been harvested yet
// (see harvestCityRanks) — mid-range so unranked names aren't over- or undersized.
const DEFAULT_RANK = 9;

// Per-feature size ramp mirroring the base style's settlement-label sizing: it keys
// the same zoom/symbolrank steps on each city's own `rank` (harvested from the base
// map), so a prominent city (low rank, e.g. Toronto 6) gets a large label and a
// minor one (high rank, e.g. Niagara Falls 11) a small one — each scaling with zoom
// like its base-map equivalent instead of a single uniform size.
const RANK = ["coalesce", ["get", "rank"], DEFAULT_RANK];
const CITY_LABEL_SIZE = ["interpolate", ["cubic-bezier", 0.2, 0, 0.9, 1], ["zoom"],
  3, ["step", RANK, 13, 6, 11],
  6, ["step", RANK, 18, 6, 16, 7, 14],
  8, ["step", RANK, 20, 9, 16, 10, 14],
  15, ["step", RANK, 24, 9, 20, 12, 16, 15, 14]];

// Read the base style's major city-label typography (font, color, halo) off an actual
// settlement-label layer so our names match it for real — including on a swapped
// base style — falling back to sensible defaults when the layer isn't present.
function cityLabelTypography() {
  const src = "settlement-major-label";
  const present = map.getLayer(src);
  const lp = (k, d) => (present ? map.getLayoutProperty(src, k) ?? d : d);
  const pp = (k, d) => (present ? map.getPaintProperty(src, k) ?? d : d);
  return {
    font: lp("text-font", defaultFont()),
    color: pp("text-color", "hsl(220, 30%, 0%)"),
    haloColor: pp("text-halo-color", "hsl(20, 25%, 100%)"),
    haloWidth: pp("text-halo-width", 1),
    haloBlur: pp("text-halo-blur", 1),
  };
}

// The loaded places data, kept so harvestCityRanks can annotate features in place
// and push the update back through the source.
let placesData = null;

// Stamp each visited city with the base map's prominence (`symbolrank`) so the size
// ramp can match the base tier per city. Ranks are normally baked into the GeoJSON at
// build time (web/data/ranks.json), correct from the first frame; this is the live
// fallback that fills in any city missing from that cache — and the means of (re)gener-
// ating it, since the base map only carries a city's feature in tiles near the current
// view. It runs on every `idle`, re-pushing the data only when a rank actually changed,
// so it converges and stops (and never fights an unchanged view).
function harvestCityRanks() {
  if (!placesData) return;
  const labelLayer = map.getLayer("settlement-major-label");
  if (!labelLayer) return;
  const sourceLayer = labelLayer.sourceLayer || labelLayer["source-layer"];
  const feats = map.querySourceFeatures(labelLayer.source, { sourceLayer });
  if (!feats.length) return;
  const baseRank = new Map(); // "<name>|<iso>" -> lowest (most prominent) symbolrank
  for (const f of feats) {
    const p = f.properties || {};
    if (typeof p.symbolrank !== "number") continue;
    const iso = p.iso_3166_1 || "";
    for (const n of [p.name_en, p.name]) {
      if (!n) continue;
      const key = String(n).toLowerCase() + KEY_SEP + iso;
      const prev = baseRank.get(key);
      if (prev === undefined || p.symbolrank < prev) baseRank.set(key, p.symbolrank);
    }
  }
  let changed = false;
  for (const feat of placesData.features) {
    const p = feat.properties || {};
    if (!p.city || !p.cc) continue;
    let best;
    for (const v of cityNameVariants(p.city)) {
      const r = baseRank.get(v + KEY_SEP + p.cc);
      if (r !== undefined && (best === undefined || r < best)) best = r;
    }
    if (best !== undefined && p.rank !== best) { p.rank = best; changed = true; }
  }
  if (changed) map.getSource("places").setData(placesData);
}

// Add the star/cluster overlay. Safe to call repeatedly: `styledata` fires
// multiple times while the style loads, and the per-item guards below make the
// re-runs idempotent.
function installOverlay(geojson) {
  placesData = geojson;
  // Idempotent per item: `styledata` fires repeatedly (sprite/tiles/style swap),
  // sometimes mid-transition, so guard every add individually.
  if (!map.hasImage("visited-star")) map.addImage("visited-star", makeStarImage(64), { sdf: true });
  if (!map.getSource("places")) {
    map.addSource("places", { type: "geojson", data: geojson, cluster: true, clusterRadius: 50, clusterMaxZoom: 8 });
  }
  hideVisitedBaseLabels(geojson);

  const cityType = cityLabelTypography();
  const beforeId = overlayBeforeId();
  if (!map.getLayer("clusters")) map.addLayer({
    id: "clusters", type: "symbol", source: "places", filter: ["has", "point_count"],
    layout: {
      "icon-image": "visited-star", "icon-allow-overlap": true,
      "icon-size": ["step", ["get", "point_count"], 0.4, 5, 0.45, 10, 0.5, 20, 0.6],
    },
    paint: { "icon-color": "#2e3a8c", "icon-halo-color": "rgba(40,40,40,0.85)", "icon-halo-width": 1.2 },
  }, beforeId);
  if (!map.getLayer("cluster-count")) map.addLayer({
    id: "cluster-count", type: "symbol", source: "places", filter: ["has", "point_count"],
    layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": defaultFont(), "text-size": 11 },
    paint: { "text-color": "#fff" },
  }, beforeId);
  if (!map.getLayer("stars")) map.addLayer({
    id: "stars", type: "symbol", source: "places", filter: ["!", ["has", "point_count"]],
    // Star and name are one symbol laid out on opposite sides of the city point:
    // the star sits above it (`icon-anchor: bottom`, tip on the point) and the
    // name below it (`text-anchor: top`), so they can never overlap at any zoom.
    // The star always draws (`icon-allow-overlap`); the name yields when crowded
    // (`text-optional` + default `text-allow-overlap: false`) but never hides its
    // star. Replaces the hidden base settlement labels (see SETTLEMENT_LABEL_RE).
    layout: {
      "icon-image": "visited-star", "icon-size": 0.3, "icon-anchor": "bottom", "icon-allow-overlap": true,
      "text-field": ["get", "city"], "text-font": cityType.font, "text-size": CITY_LABEL_SIZE, "text-max-width": 7,
      "text-anchor": "top", "text-offset": [0, 0.1], "text-optional": true,
    },
    paint: {
      "icon-color": ["coalesce", ["get", "color"], DEFAULT_STAR_COLOR], "icon-halo-color": "rgba(40,40,40,0.85)", "icon-halo-width": 1.2,
      "text-color": cityType.color, "text-halo-color": cityType.haloColor, "text-halo-width": cityType.haloWidth, "text-halo-blur": cityType.haloBlur,
    },
  }, beforeId);
}

function wireInteractions() {
  map.on("click", "clusters", (e) => {
    const feature = e.features[0];
    map.getSource("places").getClusterExpansionZoom(feature.properties.cluster_id, (err, zoom) => {
      if (err) return;
      map.easeTo({ center: feature.geometry.coordinates, zoom });
    });
  });

  map.on("click", "stars", (e) => {
    const { city, region, country } = e.features[0].properties;
    const where = [region, country].filter(Boolean).join(", ");
    new mapboxgl.Popup({ offset: 12 })
      .setLngLat(e.features[0].geometry.coordinates)
      .setHTML(`<div class="popup__city">${escapeHtml(city)}</div><div class="popup__where">${escapeHtml(where)}</div>`)
      .addTo(map);
  });

  for (const id of ["clusters", "stars"]) {
    map.on("mouseenter", id, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; });
  }
}

function fitToData(geojson) {
  const bounds = new mapboxgl.LngLatBounds();
  geojson.features.forEach((f) => bounds.extend(f.geometry.coordinates));
  if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, maxZoom: 6, duration: 0 });
}

async function init() {
  let geojson;
  try {
    geojson = await fetch(DATA_URL).then((r) => { if (!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json(); });
  } catch (err) {
    console.error("Failed to load places.geojson:", err);
    document.body.insertAdjacentHTML("beforeend",
      `<div style="position:absolute;top:1rem;left:50%;transform:translateX(-50%);padding:.6rem 1rem;background:#b00020;color:#fff;border-radius:6px;font:14px system-ui">Could not load data/places.geojson — run the build step and serve from web/.</div>`);
    return;
  }

  // The base style loads asynchronously and `styledata` fires repeatedly during
  // load; (re)install the overlay and apply the Streets tweaks each time. The
  // per-item guards in installOverlay make this idempotent.
  let fitted = false;
  const reinstall = () => {
    if (!window.MAP_STYLE) tweakStreets(); // skip customizations on a MAP_STYLE override
    installOverlay(geojson);
    if (!fitted) { fitToData(geojson); fitted = true; }
  };
  map.on("styledata", reinstall);
  if (map.isStyleLoaded()) reinstall();

  // Fill in per-city prominence from the base map as tiles load (see harvestCityRanks).
  map.on("idle", harvestCityRanks);

  wireInteractions();
  if (!STYLE_URL) {
    document.body.insertAdjacentHTML("beforeend",
      `<div style="position:absolute;top:1rem;left:50%;transform:translateX(-50%);padding:.6rem 1rem;background:#334;color:#fff;border-radius:6px;font:14px system-ui">Add a free Mapbox token to web/config.js to load a base map.</div>`);
  }
}

init();
