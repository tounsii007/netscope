import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

/**
 * NextAuth v5 config. We use OAuth providers purely to get an access token,
 * then exchange it at our backend /auth/exchange for a first-party JWT.
 * The JWT is kept server-side in the NextAuth session cookie — never exposed
 * to client JS.
 */
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
      if (account?.access_token) {
        try {
          const res = await fetch(
            `${process.env.NETSCOPE_API_URL ?? "http://localhost:8080"}/api/v1/auth/exchange`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                provider: account.provider,
                accessToken: account.access_token,
              }),
            },
          );
          if (res.ok) {
            const data = await res.json();
            token.netscopeJwt = data.token;
            token.workspace = data.workspace;
            token.user = data.user;
          }
        } catch (e) {
          console.error("NetScope exchange failed", e);
        }
      }
      return token;
    },
    async session({ session, token }) {
      return {
        ...session,
        netscopeJwt: token.netscopeJwt as string | undefined,
        workspace: token.workspace,
        user: { ...session.user, ...(token.user as object | undefined) },
      };
    },
  },
});
