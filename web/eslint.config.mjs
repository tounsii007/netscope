/**
 * ESLint 9 Flat Config — replaces .eslintrc.json after the Next.js 16 upgrade.
 *
 * Next.js 16 dropped the bundled `next lint` command in favour of using
 * ESLint directly with `eslint-config-next` v16+, which now ships as a
 * flat-config-shaped array (each entry is one of ESLint's new
 * `Linter.Config` objects). The two named entrypoints
 * `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`
 * already include the React, hooks, jsx-a11y, import, and Next-specific
 * rules the old "extends" form pulled in.
 *
 * Ignore globs cover build outputs and tooling-managed directories that
 * ESLint should never walk into; this used to be `.eslintignore` in the
 * legacy format.
 */

import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "playwright-report/**",
      "playwright/.cache/**",
      "coverage/**",
      "out/**",
      "next-env.d.ts",
      "tsconfig.tsbuildinfo",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // react-hooks v7 ships several new "compiler-style" rules as errors:
    //   • set-state-in-effect       — setState() inside useEffect body
    //   • error-boundaries          — JSX constructed in try/catch
    //   • purity                    — impure calls during render
    // Each catches a real anti-pattern, but our existing components have
    // legitimate uses (reset-on-route-change, etc.) that pre-date these
    // rules. Downgrade to "warn" so the lint command stays useful for
    // new code without forcing a same-PR rewrite of stable surfaces;
    // a follow-up sweep can address the remaining warnings cleanly.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/error-boundaries":    "warn",
      "react-hooks/purity":               "warn",
    },
  },
  {
    // Test files reach for require() to break the import cycle that
    // the typecheck-time mocking pattern needs (vi.mock + require of
    // the mocked module inside the test). Allow it inside tests only —
    // production code is held to the import-only rule.
    files: ["tests/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      // The smoke suite intentionally renders many <Component /> entries
      // inline without a list-key — they're not part of a mapped array,
      // each is a sibling node. The rule's heuristic falsely flags them.
      "react/jsx-key": "off",
    },
  },
];

export default config;
