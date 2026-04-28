// Bundle-size budget gate — runs after `next build` in CI.
//
// What we measure: gzipped JavaScript sizes, mirroring what Next.js itself
// reports as "First Load JS" in the build output. Browsers receive these
// bytes over the wire after gzip / brotli compression, so any other unit
// (raw bytes, post-decompress) gives a misleading number.
//
// We deliberately don't depend on @next/bundle-analyzer because its HTML
// report isn't stable enough for CI. Instead we walk Next's own manifest
// JSON files and gzip-compress each chunk ourselves.

import {
  readFileSync, readdirSync, statSync, existsSync,
} from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname.replace(/^\/(\w):/, "$1:");
const NEXT_DIR = join(ROOT, ".next");
const BUDGET = JSON.parse(
  readFileSync(new URL("./budget.json", import.meta.url), "utf8")
);

if (!existsSync(NEXT_DIR)) {
  fail(`Build directory ${NEXT_DIR} missing. Run \`npm run build\` first.`);
}

const manifest = readJson(join(NEXT_DIR, "build-manifest.json"));
const appManifest = readOptional(join(NEXT_DIR, "app-build-manifest.json"));

const homeChunks = pickHomeChunks(manifest, appManifest);
const homeKb = sumGzippedKb(homeChunks);
const totalKb = totalGzippedJsKb();
const perRoute = perRouteGzippedSizes(appManifest);

const issues = [];
if (homeKb > BUDGET.firstLoadJsKb.max) {
  issues.push(
    `firstLoadJsKb: ${fmt(homeKb)} KB > budget ${BUDGET.firstLoadJsKb.max} KB`
  );
}
if (totalKb > BUDGET.totalJsKb.max) {
  issues.push(
    `totalJsKb: ${fmt(totalKb)} KB > budget ${BUDGET.totalJsKb.max} KB`
  );
}
for (const [route, kb] of perRoute) {
  if (kb > BUDGET.perRouteFirstLoadJsKb.max) {
    issues.push(
      `perRouteFirstLoadJsKb[${route}]: ${fmt(kb)} KB > budget ${BUDGET.perRouteFirstLoadJsKb.max} KB`
    );
  }
}

console.log("Performance budget check  (sizes are gzip-level-9, the wire format)");
console.log("─".repeat(72));
console.log(`First-load JS (home)   : ${fmt(homeKb)} KB  / budget ${BUDGET.firstLoadJsKb.max} KB`);
console.log(`Total JS in build      : ${fmt(totalKb)} KB  / budget ${BUDGET.totalJsKb.max} KB`);
console.log(`Per-route slowest      : ${slowest(perRoute)}`);
console.log("─".repeat(72));

if (issues.length > 0) {
  console.error(`\n❌ Budget exceeded (${issues.length}):`);
  for (const i of issues) console.error("   ·", i);
  console.error("\nTo intentionally raise: edit tests/perf/budget.json in the same PR.");
  process.exit(1);
}
console.log("✓ All bundle budgets passed.");

// ─── helpers ────────────────────────────────────────────────────────

function pickHomeChunks(m, app) {
  const sharedKeys = ["/_app", "/", "_app", "polyfillFiles", "lowPriorityFiles"];
  const set = new Set();
  for (const k of sharedKeys) {
    const arr = m[k] ?? m.pages?.[k];
    if (Array.isArray(arr)) for (const f of arr) if (f.endsWith(".js")) set.add(f);
  }
  if (app?.pages) {
    const home = app.pages["/[locale]/page"] ?? app.pages["/"] ?? [];
    for (const f of home) if (f.endsWith(".js")) set.add(f);
  }
  return [...set];
}

function sumGzippedKb(files) {
  let bytes = 0;
  for (const f of files) {
    const p = join(NEXT_DIR, f);
    bytes += gzipSizeOf(p);
  }
  return bytes / 1024;
}

function totalGzippedJsKb() {
  let bytes = 0;
  walk(join(NEXT_DIR, "static"), (p) => {
    if (p.endsWith(".js")) bytes += gzipSizeOf(p);
  });
  return bytes / 1024;
}

function perRouteGzippedSizes(app) {
  const out = [];
  if (!app?.pages) return out;
  for (const [route, files] of Object.entries(app.pages)) {
    if (route.includes("_not-found")) continue;
    const kb = sumGzippedKb(files.filter((f) => f.endsWith(".js")));
    out.push([route, kb]);
  }
  out.sort((a, b) => b[1] - a[1]);
  return out;
}

function gzipSizeOf(absPath) {
  try {
    const buf = readFileSync(absPath);
    return gzipSync(buf, { level: 9 }).length;
  } catch {
    // Missing file — common for sibling .nft.json paths the manifest
    // references but that don't ship to the browser.
    return 0;
  }
}

function slowest(list) {
  if (list.length === 0) return "—";
  const [route, kb] = list[0];
  return `${fmt(kb)} KB  (${route})`;
}

function walk(dir, fn) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSafe(dir)) {
    const p = join(dir, entry);
    let s;
    try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) walk(p, fn);
    else fn(p);
  }
}

function readdirSafe(d) {
  try { return readdirSync(d); } catch { return []; }
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (e) { fail(`could not read ${path}: ${e.message}`); }
}
function readOptional(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}
function fmt(kb) { return Number(kb).toFixed(1); }
function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}
