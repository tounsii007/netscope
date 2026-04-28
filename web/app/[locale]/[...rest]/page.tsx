import { notFound } from "next/navigation";

/**
 * Catch-all under `[locale]` for any path that no real route matches.
 *
 * Why this exists: Next.js App Router has a known quirk with `not-found.tsx`
 * inside dynamic segments. When a path like `/de/port-checkerosjkfsf` is
 * requested and no concrete route matches, Next.js renders the *root*
 * `not-found.tsx` (or its built-in default) instead of the nearest one.
 *
 * By adding this catch-all page that immediately calls `notFound()`, we
 * force Next.js to render our localised `[locale]/not-found.tsx` — which
 * gives the user the branded 404 with locale, did-you-mean suggestion,
 * popular tools and the Traceronix logo.
 *
 * The middleware (next-intl) only redirects valid locale prefixes here,
 * so this route is never hit for `/`, `/de`, `/en`, etc. directly.
 */
export default function CatchAllNotFound() {
  notFound();
}
