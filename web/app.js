"use strict";

// Base maps shown in the in-page switcher (top-right). These need a free MapTiler
// key in config.js (window.MAPTILER_KEY); without one, init() shows a prompt.
function maptilerStyles(key) {
  const url = (id) => `https://api.maptiler.com/maps/${id}/style.json?key=${key}`;
  return [
    { label: "Streets", url: url("streets-v2") },
    { label: "Satellite hybrid", url: url("hybrid") },
    { label: "Light (Dataviz)", url: url("dataviz") },
  ];
}

const STYLES = window.MAPTILER_KEY ? maptilerStyles(window.MAPTILER_KEY) : [];
const STYLE_URL = window.MAP_STYLE || (STYLES[0] && STYLES[0].url);

// data/ lives inside web/, so the whole bundle serves from web/.
const DATA_URL = new URL("data/places.geojson", window.location.href).href;

// Empty style keeps the app alive (stars still render) when no key is configured.
const BLANK_STYLE = { version: 8, sources: {}, layers: [] };
const map = new maplibregl.Map({ container: "map", style: STYLE_URL || BLANK_STYLE, center: [0, 20], zoom: 1.4 });
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");

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

// Add the star/cluster overlay. Safe to call repeatedly: switching the base map
// wipes custom sources/layers/images, so this re-runs on every style load.
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
  map.on("click", "clusters", async (e) => {
    const feature = e.features[0];
    const zoom = await map.getSource("places").getClusterExpansionZoom(feature.properties.cluster_id);
    map.easeTo({ center: feature.geometry.coordinates, zoom });
  });

  map.on("click", "stars", (e) => {
    const { city, region, country } = e.features[0].properties;
    const where = [region, country].filter(Boolean).join(", ");
    new maplibregl.Popup({ offset: 12 })
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
  const bounds = new maplibregl.LngLatBounds();
  geojson.features.forEach((f) => bounds.extend(f.geometry.coordinates));
  if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, maxZoom: 6, duration: 0 });
}

// Top-right dropdown to switch base maps live. setStyle keeps the current camera
// and fires `styledata`, which re-installs the overlay.
function buildStyleSwitcher() {
  const select = document.createElement("select");
  select.className = "style-switcher";
  STYLES.forEach((style) => {
    const option = document.createElement("option");
    option.value = style.url;
    option.textContent = style.label;
    option.selected = style.url === STYLE_URL;
    select.appendChild(option);
  });
  // diff:false forces a clean swap so custom layers don't linger half-removed.
  select.addEventListener("change", () => map.setStyle(select.value, { diff: false }));
  document.body.appendChild(select);
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

  let fitted = false;
  map.on("styledata", () => {
    installOverlay(geojson, colorMatch);
    if (!fitted) { fitToData(geojson); fitted = true; }
  });
  if (map.isStyleLoaded()) { installOverlay(geojson, colorMatch); if (!fitted) { fitToData(geojson); fitted = true; } }

  wireInteractions();
  if (STYLES.length) buildStyleSwitcher();
  if (!STYLE_URL) {
    document.body.insertAdjacentHTML("beforeend",
      `<div style="position:absolute;top:1rem;left:50%;transform:translateX(-50%);padding:.6rem 1rem;background:#334;color:#fff;border-radius:6px;font:14px system-ui">Add a free MapTiler key to web/config.js to load a base map.</div>`);
  }
}

init();
