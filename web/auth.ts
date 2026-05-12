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
