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

// Golden-angle hues give visually distinct, evenly spread colors for any count.
function buildPalette(countries) {
  const palette = {};
  countries.forEach((country, i) => { palette[country] = `hsl(${Math.round((i * 137.508) % 360)}, 70%, 45%)`; });
  return palette;
}

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

// Add the star/cluster overlay. Safe to call repeatedly: `styledata` fires
// multiple times while the style loads, and the per-item guards below make the
// re-runs idempotent.
function installOverlay(geojson, colorMatch) {
  // Idempotent per item: `styledata` fires repeatedly (sprite/tiles/style swap),
  // sometimes mid-transition, so guard every add individually.
  if (!map.hasImage("visited-star")) map.addImage("visited-star", makeStarImage(64), { sdf: true });
  if (!map.getSource("places")) {
    map.addSource("places", { type: "geojson", data: geojson, cluster: true, clusterRadius: 50, clusterMaxZoom: 8 });
  }

  if (!map.getLayer("clusters")) map.addLayer({
    id: "clusters", type: "circle", source: "places", filter: ["has", "point_count"],
    paint: {
      "circle-color": "#5a6acf", "circle-opacity": 0.85,
      "circle-radius": ["step", ["get", "point_count"], 16, 10, 22, 50, 30],
      "circle-stroke-width": 2, "circle-stroke-color": "#fff",
    },
  });
  if (!map.getLayer("cluster-count")) map.addLayer({
    id: "cluster-count", type: "symbol", source: "places", filter: ["has", "point_count"],
    layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": defaultFont(), "text-size": 12 },
    paint: { "text-color": "#fff" },
  });
  if (!map.getLayer("stars")) map.addLayer({
    id: "stars", type: "symbol", source: "places", filter: ["!", ["has", "point_count"]],
    layout: { "icon-image": "visited-star", "icon-size": 0.45, "icon-allow-overlap": true },
    paint: { "icon-color": colorMatch, "icon-halo-color": "rgba(40,40,40,0.85)", "icon-halo-width": 1.2 },
  });
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

  const countries = [...new Set(geojson.features.map((f) => f.properties.country))].sort();
  const palette = buildPalette(countries);
  const colorMatch = ["match", ["get", "country"], ...countries.flatMap((c) => [c, palette[c]]), "#888"];

  // The base style loads asynchronously and `styledata` fires repeatedly during
  // load; (re)install the overlay and apply the Streets tweaks each time. The
  // per-item guards in installOverlay make this idempotent.
  let fitted = false;
  const reinstall = () => {
    if (!window.MAP_STYLE) tweakStreets(); // skip customizations on a MAP_STYLE override
    installOverlay(geojson, colorMatch);
    if (!fitted) { fitToData(geojson); fitted = true; }
  };
  map.on("styledata", reinstall);
  if (map.isStyleLoaded()) reinstall();

  wireInteractions();
  if (!STYLE_URL) {
    document.body.insertAdjacentHTML("beforeend",
      `<div style="position:absolute;top:1rem;left:50%;transform:translateX(-50%);padding:.6rem 1rem;background:#334;color:#fff;border-radius:6px;font:14px system-ui">Add a free Mapbox token to web/config.js to load a base map.</div>`);
  }
}

init();
