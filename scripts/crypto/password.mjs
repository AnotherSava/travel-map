// Resolve the single visits password shared by the owner (to encrypt) and the
// site visitor (to view). Precedence:
//   1. TRAVEL_VISITS_PASSWORD env var — covers `doppler run` injection and a manual export.
//   2. `doppler secrets get` from project travel-map — a bare `node scripts/...` run still finds it.
//   3. Interactive hidden prompt — last resort when neither is available.
import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline";

const SECRET = "TRAVEL_VISITS_PASSWORD";
const DOPPLER_PROJECT = "travel-map";
const DOPPLER_CONFIG = "dev";

export async function resolvePassword() {
  const raw = process.env[SECRET] || tryDoppler() || (await promptHidden(`Enter ${SECRET} (input hidden): `));
  // Surrounding whitespace is never part of the password: trim every source so the
  // bytes fed to PBKDF2 don't depend on how the password was supplied, and match
  // what a browser viewer types (web/app.js submitPassword also trims).
  return raw.trim();
}

function tryDoppler() {
  try {
    const out = execFileSync(
      "doppler", ["secrets", "get", SECRET, "--project", DOPPLER_PROJECT, "--config", DOPPLER_CONFIG, "--plain"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return out.trim() || null;
  } catch {
    return null; // doppler not installed / not authed / secret absent — fall through to prompt.
  }
}

// Read a line from the TTY without echoing keystrokes.
function promptHidden(query) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    rl._writeToOutput = (s) => { if (!muted) rl.output.write(s); }; // let the query print, then silence typed chars
    rl.question(query, (value) => { rl.close(); process.stdout.write("\n"); resolve(value); });
    muted = true;
  });
}
