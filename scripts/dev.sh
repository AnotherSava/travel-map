#!/usr/bin/env bash
# Local dev server: serves web/ at http://localhost:8000/ so changes can be checked without
# deploying to production.
#
# The port is fixed at 8000 and is NOT freely changeable. The dev Mapbox token is
# URL-restricted to http://localhost:8000, and Mapbox restrictions accept no wildcards and no
# port ranges — so on any other port every tile request returns 403 and the map renders as a
# blank white globe with nothing useful in the console. To move ports, first add the new URL
# to the token at https://account.mapbox.com/access-tokens/.
set -euo pipefail

PORT=8000
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT is already in use. Stop the other server first — this port is pinned by the Mapbox token's URL restriction." >&2
  exit 1
fi

# Regenerate the gitignored token config from Doppler, so a fresh clone (or a working tree
# that lost the file) never silently serves a tokenless, blank map.
if command -v doppler >/dev/null 2>&1 && token=$(doppler secrets get MAPBOX_TOKEN --project travel-map --config dev --plain 2>/dev/null); then
  printf 'window.MAPBOX_TOKEN = "%s";\n' "$token" > "$ROOT/web/config.js"
  echo "Wrote web/config.js from Doppler (travel-map/dev)."
elif [ -f "$ROOT/web/config.js" ]; then
  echo "Doppler unavailable — reusing the existing web/config.js."
else
  echo "No Mapbox token available: Doppler is unreachable and web/config.js is missing. The map will render blank." >&2
fi

echo "Serving web/ at http://localhost:$PORT/ — press Ctrl+C to stop."
exec python3 -m http.server "$PORT" --directory "$ROOT/web"
