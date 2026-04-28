import { headers } from "next/headers";

/**
 * Recover the original request path for the 404 page so we can echo it
 * back to the user as a debugging aid. The next-intl middleware sets
 * `x-pathname` on every request; the other headers are fallbacks for
 * proxies / edge runtimes that don't propagate it.
 */
export async function readRequestedPath(): Promise<string> {
  try {
    const h = await headers();
    return (
      h.get("x-pathname") ??
      h.get("x-invoke-path") ??
      h.get("x-original-url") ??
      h.get("referer")?.replace(/^https?:\/\/[^/]+/, "") ??
      ""
    );
  } catch {
    // headers() can throw outside a request context (e.g. during static
    // optimisation). The 404 page degrades gracefully with no path.
    return "";
  }
}
