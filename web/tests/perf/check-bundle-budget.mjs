// Bundle-size budget gate — runs after `next build` in CI.
//
// Reads the build manifest, sums the JS that ships on the home route,
// and fails (exit 1) when any number breaches tests/perf/budget.json.
//
// We intentionally don't depend on @next/bundle-analyzer here — its
// HTML report is great for humans but not stable enough for CI.
// Instead we walk Next's own .next/build-manifest.json + measure file
// sizes ourselves. Robust against minor Next-internal layout changes
// because we only depend on file paths, not on undocumented APIs.

import { readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname.replace(/^\/(\w):/, "$1:");
const NEXT_DIR = join(ROOT, ".next");
const BUDGET = JSON.parse(readFileSync(new URL("./budget.json", import.meta.url), "utf8"));

if (!existsSync(NEXT_DIR)) {
  fail(`Build directory ${NEXT_DIR} missing. Run \`npm run build\` first.`);
}

const manifest = readJson(join(NEXT_DIR, "build-manifest.json"));
const appManifest = readOptional(join(NEXT_DIR, "app-build-manifest.json")); // App-Router specific

const homeChunks = pickHomeChunks(manifest, appManifest);
const homeSizeKb = sumKb(homeChunks);
const totalJsKb = totalJsSizeKb();

const issues = [];
if (homeSizeKb > BUDGET.firstLoadJsKb.max) {
  issues.push(
    `firstLoadJsKb: ${homeSizeKb.toFixed(1)} KB > budget ${BUDGET.firstLoadJsKb.max} KB`
  );
}
if (totalJsKb > BUDGET.totalJsKb.max) {
  issues.push(
    `totalJsKb: ${totalJsKb.toFixed(1)} KB > budget ${BUDGET.totalJsKb.max} KB`
  );
}

const perRoute = perRouteSizes(appManifest);
for (const [route, kb] of perRoute) {
  if (kb > BUDGET.perRouteFirstLoadJsKb.max) {
    issues.push(
      `perRouteFirstLoadJsKb[${route}]: ${kb.toFixed(1)} KB > budget ${BUDGET.perRouteFirstLoadJsKb.max} KB`
    );
  }
}

console.log("Performance budget check");
console.log("─".repeat(60));
console.log(`First-load JS (home)   : ${homeSizeKb.toFixed(1)} KB  / budget ${BUDGET.firstLoadJsKb.max} KB`);
console.log(`Total JS in build      : ${totalJsKb.toFixed(1)} KB  / budget ${BUDGET.totalJsKb.max} KB`);
console.log(`Per-route slowest p95  : ${slowestRoute(perRoute)}`);
console.log("─".repeat(60));

if (issues.length > 0) {
  console.error("\n❌ Budget exceeded:");
  for (const i of issues) console.error("   ·", i);
  console.error("\nTo intentionally raise: edit tests/perf/budget.json in the same PR.");
  process.exit(1);
}
console.log("✓ All bundle budgets passed.");

// ─── helpers ────────────────────────────────────────────────────────

function pickHomeChunks(m, app) {
  // App Router stores per-route chunks under the special "_app" key in
  // the legacy manifest, plus a per-segment list in app-build-manifest.
  const sharedKeys = ["/_app", "/", "_app", "polyfillFiles", "lowPriorityFiles"];
  const set = new Set();
  for (const k of sharedKeys) {
    const arr = m[k] ?? m.pages?.[k];
    if (Array.isArray(arr)) for (const f of arr) if (f.endsWith(".js")) set.add(f);
  }
  // App Router files are listed under "pages":{"/":[…]} with absolute paths.
  if (app?.pages) {
    const home = app.pages["/[locale]/page"] ?? app.pages["/"] ?? [];
    for (const f of home) if (f.endsWith(".js")) set.add(f);
  }
  return [...set];
}

function sumKb(files) {
  let bytes = 0;
  for (const f of files) {
    const p = join(NEXT_DIR, f);
    try { bytes += statSync(p).size; } catch { /* missing — ignore */ }
  }
  return bytes / 1024;
}

function totalJsSizeKb() {
  let bytes = 0;
  walk(join(NEXT_DIR, "static"), (p) => {
    if (p.endsWith(".js")) bytes += statSync(p).size;
  });
  return bytes / 1024;
}

function perRouteSizes(app) {
  const out = [];
  if (!app?.pages) return out;
  for (const [route, files] of Object.entries(app.pages)) {
    if (route === "/[locale]/_not-found/page" || route === "/_not-found/page") continue;
    const kb = sumKb(files.filter((f) => f.endsWith(".js")));
    out.push([route, kb]);
  }
  out.sort((a, b) => b[1] - a[1]);
  return out;
}

function slowestRoute(list) {
  if (list.length === 0) return "—";
  const [route, kb] = list[0];
  return `${kb.toFixed(1)} KB  (${route})`;
}

function walk(dir, fn) {
  if (!existsSync(dir)) return;
  for (const e of readdirSafe(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, fn);
    else fn(p);
  }
}

function readdirSafe(d) {
  try { return require("node:fs").readdirSync(d); } catch { return []; }
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (e) { fail(`could not read ${path}: ${e.message}`); }
}
function readOptional(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}
function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}
