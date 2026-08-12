---
name: project_browser_verification
description: "Verify travel-map changes against the local :8000 server with a self-launched headless Chrome + chrome-devtools MCP; the claude-in-chrome extension's screenshot is permanently wedged on this map page"
metadata:
  type: project
---

Checking a map change visually means the **chrome-devtools MCP**, not the claude-in-chrome
extension. On this app's Mapbox GL page `computer{action:"screenshot"}` fails every time with
`Script injection timed out after 5000ms` — permanently, not transiently, even while the tab is
idle and `read_console_messages` answers normally. Don't spend retries on it (2026-08-11: six
attempts, all dead).

Working loop: `bash scripts/deploy.sh` for the server on :8000, launch a throwaway headless
Chrome on `--remote-debugging-port=9222`, then `new_page` → `take_screenshot` / `evaluate_script`.
Launch and kill commands are in the `chrome-devtools-mcp` learning; kill the tree by its
`--user-data-dir` and delete the temp profile when done, or a stray instance holds the port.

`evaluate_script` reaches the app's top-level `const`s directly (`map`, `placesData`,
`decryptedVisits`, `popupHtml`, `formatVisitDates` — it's a classic script, so they're global
lexical bindings, not `window` properties). That gives two things worth knowing:

- **Harvest a new city's `rank`** without the password: `map.jumpTo` to it, wait for idle, read
  `placesData.features.find(f => f.properties.city === '<name>').properties.rank`, then write it
  into `ranks.json` and rebuild. This is the regeneration path `docs/input-format.md` describes.
- **Check popup rendering** by assigning a stub to `decryptedVisits` and calling `popupHtml(props)`
  — never type the real visit password into the browser.

See [[project_mapbox_renderer]] for the token/style setup and [[project_travel_map_hosting]] for
how the server and publishing work.
