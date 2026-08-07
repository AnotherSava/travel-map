// Local config (gitignored). `./scripts/dev.sh` regenerates config.js from Doppler
// (travel-map/dev) on every run, so normally you never touch this file. Copy it to
// `config.js` and paste a token only when Doppler isn't available; get a free one at
// https://account.mapbox.com/ (Tokens). Without a token the app shows a prompt instead
// of a map. The dev token is URL-restricted to http://localhost:8000, so serve on that
// exact port — elsewhere the style loads but every tile 403s and the globe is blank.
window.MAPBOX_TOKEN = "";

// Optional: force a specific style URL (mapbox://... or any Mapbox-style JSON), replacing
// the customized Streets default and skipping its road/border tweaks.
// window.MAP_STYLE = "mapbox://styles/mapbox/dark-v11";
