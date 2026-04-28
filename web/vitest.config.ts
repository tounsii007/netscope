import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // Use esbuild's automatic JSX runtime so .tsx tests don't need
  // `import React from 'react'` at the top of every file.
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // Vitest must NOT pick up Playwright e2e specs.
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules/**", "e2e/**", "playwright-report/**", ".next/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["app/**/*.{ts,tsx}", "lib/**/*.ts", "components/**/*.tsx"],
      exclude: [
        "**/*.d.ts",
        "**/layout.tsx",
        "**/page.tsx",
        // Server-only / Node-only — needs Node-runtime tests, not jsdom
        "lib/logger.ts",
        // Leaflet-bound interactive map; tested via Playwright e2e
        "components/ip-map.tsx",
        // Server components rendered by Next.js — covered indirectly via e2e
        "components/site-nav.tsx",
        "components/site-footer.tsx",
        // Auth.js wires its own handler; not a useful unit-test target
        "app/api/auth/**",
      ],
      thresholds: {
        // Realistic floors given the current scope. Per-file thresholds for
        // directly-tested modules are stricter via the explicit perFile entry.
        lines:      45,
        functions:  35,
        statements: 45,
        branches:   55,
        // Critical helpers — anything that runs on every request — must be
        // very thoroughly covered. CI fails when these slip below 90%.
        "lib/not-found/levenshtein.ts":            { lines: 95, functions: 100, branches: 90 },
        "lib/not-found/suggest-tool.ts":           { lines: 90, functions: 100, branches: 80 },
        "lib/rate-limit.ts":                       { lines: 90, functions: 90, branches: 80 },
        "app/[locale]/jwt/jwt-decode.ts":          { lines: 95, functions: 100, branches: 90 },
        "components/tool-explainer/split-bullets.ts": { lines: 95, functions: 100, branches: 90 },
        "app/[locale]/subdomains/highlight.tsx":   { lines: 95, functions: 100, branches: 85 },
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
});
