import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { logger } from "@/lib/logger";

/**
 * NextAuth v5 config. We use OAuth providers purely to get an access token,
 * then exchange it at our backend /auth/exchange for a first-party JWT.
 *
 * IMPORTANT: the NetScope JWT is stored on the NextAuth JWT cookie
 * (HttpOnly, server-only) — it MUST NOT be returned from the session()
 * callback. The session object is what useSession()/auth() expose to
 * client components, so anything added there is reachable from browser
 * JS (a stored-XSS would lift it). Server-side callers that need the
 * upstream JWT use {@link getNetscopeJwt()} below which reads it from
 * the JWT directly via getToken().
 *
 * The exchange call is bounded by a 5-second hard timeout; if the
 * backend is degraded we fall through to a session without the JWT so
 * the sign-in flow still completes (the user's UI clearly reflects the
 * unauthenticated state and they can retry later instead of being
 * stuck on a hanging callback page).
 *
 * Failures route through the Winston logger so they land in the same
 * daily-rotate files as the rest of the server-side log surface.
 * Reasons are logged as enums (timeout / non_ok / network_error) so
 * upstream URLs aren't leaked into log messages.
 */

const EXCHANGE_TIMEOUT_MS = 5_000;

/**
 * F-FE-07: explicit allowlist of paths that the NextAuth `redirect`
 * callback will honor as a post-sign-in destination. The
 * `/api/auth/[...nextauth]` catch-all route accepts arbitrary
 * `callbackUrl` query params, and while the same-origin gate (F-FE-05,
 * below) already blocks cross-origin redirects, an attacker on the
 * same origin can still steer a freshly-authenticated user toward an
 * unintended page (e.g. an obscure admin-debug surface, or a deep
 * link that confuses the user about which app they just logged into).
 *
 * The check is applied to the URL's *pathname* and is locale-aware:
 * next-intl prefixes non-default locales (e.g. `/de/dashboard`), so
 * we strip a leading `/{locale}` segment before comparing against the
 * allowlist. Keep this list small — every entry is a route a
 * post-auth redirect can land on.
 *
 * Anything not on the list falls back to `baseUrl`, which itself goes
 * through next-intl's default-locale routing.
 */
const ALLOWED_CALLBACK_PATHS = new Set<string>([
  "/",
  "/dashboard",
  "/sign-in",
]);

const KNOWN_LOCALES = new Set<string>([
  "en", "de", "fr", "es", "it", "pl", "ru", "uk", "tr", "hi", "zh",
]);

/** Strip a leading `/{locale}` segment if it matches a known locale. */
function stripLocale(pathname: string): string {
  const m = /^\/([a-z]{2})(\/|$)/.exec(pathname);
  if (m && KNOWN_LOCALES.has(m[1])) {
    const rest = pathname.slice(m[0].length - (m[2] === "/" ? 1 : 0));
    return rest.length === 0 ? "/" : rest;
  }
  return pathname;
}

function isAllowedCallbackPath(pathname: string): boolean {
  return ALLOWED_CALLBACK_PATHS.has(stripLocale(pathname));
}

async function exchangeForNetScopeJwt(provider: string, accessToken: string) {
  const url = `${process.env.NETSCOPE_API_URL ?? "http://localhost:8080"}/api/v1/auth/exchange`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), EXCHANGE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, accessToken }),
      signal: ac.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      logger.error("netscope.auth.exchange_failed", { reason: "non_ok", status: res.status, provider });
      return null;
    }
    return (await res.json()) as { token: string; workspace?: unknown; user?: unknown };
  } catch (e) {
    const reason = (e as Error)?.name === "AbortError" ? "timeout" : "network_error";
    logger.error("netscope.auth.exchange_failed", { reason, provider });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  // F-FE-05: refuse to trust X-Forwarded-Host / X-Forwarded-Proto from any
  // peer. With trustHost=true (the default when AUTH_TRUST_HOST is set) a
  // request can drive the canonical base URL via untrusted forwarding
  // headers, which enables open-redirect and CSRF-on-callback attacks. We
  // pin the canonical origin via the explicit NEXTAUTH_URL env var in
  // production instead — see web/.env.example.
  trustHost: false,
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      authorization: { params: { scope: "read:user user:email" } },
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    // F-FE-05: explicit same-origin allowlist for post-auth redirects. The
    // NextAuth default already prevents cross-origin absolute URLs, but
    // pinning it here makes the policy auditable and removes any
    // dependence on version-specific defaults. callbackUrl values that
    // point at a different origin are bounced back to baseUrl rather than
    // honored.
    //
    // F-FE-07: stack a path allowlist on top of the same-origin check.
    // The `/api/auth/[...nextauth]` catch-all accepts any callbackUrl
    // query param, so a same-origin URL could still steer the user to
    // an unintended in-app page. Only paths in ALLOWED_CALLBACK_PATHS
    // (locale-prefixed variants are accepted; see stripLocale above)
    // are honored; everything else falls back to baseUrl.
    async redirect({ url, baseUrl }) {
      try {
        const parsed = new URL(url, baseUrl);
        // 1. Must be same-origin (F-FE-05).
        if (parsed.origin !== baseUrl) return baseUrl;
        // 2. Must be on the explicit path allowlist (F-FE-07).
        if (!isAllowedCallbackPath(parsed.pathname)) return baseUrl;
        return parsed.toString();
      } catch {
        return baseUrl;
      }
    },
    async jwt({ token, account }) {
      if (account?.access_token && account.provider) {
        const data = await exchangeForNetScopeJwt(account.provider, account.access_token);
        if (data) {
          token.netscopeJwt = data.token;
          token.workspace = data.workspace;
          token.user = data.user;
        }
      }
      return token;
    },
    async session({ session, token }) {
      // DO NOT copy token.netscopeJwt into the returned session.
      // This object is exposed to client components via useSession().
      // The upstream JWT lives only on the NextAuth JWT cookie
      // (HttpOnly) and is reachable server-side via getNetscopeJwt().
      return {
        ...session,
        workspace: token.workspace,
        user: { ...session.user, ...(token.user as object | undefined) },
      };
    },
  },
});

/**
 * Server-only helper to read the upstream NetScope JWT from the
 * NextAuth JWT cookie. Returns undefined for unauthenticated callers
 * or when the exchange step failed at sign-in time.
 *
 * Callers MUST be on the server (Server Components, Route Handlers,
 * Server Actions). Using this from a client component would import
 * "next-auth/jwt" into the browser bundle and break.
 */
export async function getNetscopeJwt(): Promise<string | undefined> {
  // Import lazily so the dependency stays out of any accidental
  // client-bundle path.
  const { getToken } = await import("next-auth/jwt");
  const { cookies, headers } = await import("next/headers");
  // next-auth/jwt's getToken wants a NextRequest-shaped object.
  // We build a minimal one from the current request's headers + cookies.
  const reqHeaders = await headers();
  const cookieJar = await cookies();
  const fakeReq = {
    headers: { get: (k: string) => reqHeaders.get(k) },
    cookies: { get: (k: string) => ({ value: cookieJar.get(k)?.value }) },
  } as unknown as Parameters<typeof getToken>[0]["req"];
  const token = await getToken({ req: fakeReq, secret: process.env.AUTH_SECRET });
  const jwt = token?.netscopeJwt;
  return typeof jwt === "string" ? jwt : undefined;
}
