import "server-only";
import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

const TENANT_ID = process.env.AZURE_TENANT_ID;
const CLIENT_ID = process.env.AZURE_CLIENT_ID;

/**
 * Delegated scope requested at sign-in. `offline_access` is what earns a
 * refresh token; without it Microsoft only hands back the ~1hr access token
 * and every session would need a full re-login once that expires.
 */
const SCOPE = "openid profile email offline_access Sites.ReadWrite.All";

const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const REFRESH_BUFFER_SECONDS = 60;

interface RefreshedTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function refreshAccessToken(refreshToken: string): Promise<RefreshedTokens> {
  const response = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID ?? "",
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: SCOPE
      })
    }
  );
  if (!response.ok) {
    throw new Error(`Token refresh failed with status ${response.status}`);
  }
  return (await response.json()) as RefreshedTokens;
}

/**
 * Two dashboard tabs open at once can both notice an expired token in the
 * same instant. Without this, each fires its own refresh call and Microsoft's
 * rotating refresh tokens mean the loser of that race gets rejected. Keying
 * the in-flight promise by refresh token makes the second caller just await
 * the first call's result instead of starting a competing one.
 */
const refreshInFlight = new Map<string, Promise<RefreshedTokens>>();

function refreshAccessTokenOnce(refreshToken: string): Promise<RefreshedTokens> {
  let inFlight = refreshInFlight.get(refreshToken);
  if (!inFlight) {
    inFlight = refreshAccessToken(refreshToken).finally(() => {
      refreshInFlight.delete(refreshToken);
    });
    refreshInFlight.set(refreshToken, inFlight);
  }
  return inFlight;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    MicrosoftEntraID({
      clientId: CLIENT_ID,
      issuer: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
      // No client secret: this app is registered as a public client, so the
      // token exchange is authenticated by PKCE alone.
      client: { token_endpoint_auth_method: "none" },
      checks: ["pkce"],
      authorization: { params: { scope: SCOPE } }
    })
  ],
  callbacks: {
    async signIn({ profile }) {
      if (ALLOWED_EMAILS.length === 0) return true;
      const email = profile?.email?.toLowerCase();
      return Boolean(email && ALLOWED_EMAILS.includes(email));
    },
    async jwt({ token, account }) {
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
          error: undefined
        };
      }

      const expiresAt = typeof token.expiresAt === "number" ? token.expiresAt : 0;
      if (Date.now() < expiresAt * 1000 - REFRESH_BUFFER_SECONDS * 1000) {
        return token;
      }

      if (typeof token.refreshToken !== "string") {
        return { ...token, error: "RefreshTokenMissing" as const };
      }

      try {
        const refreshed = await refreshAccessTokenOnce(token.refreshToken);
        return {
          ...token,
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token ?? token.refreshToken,
          expiresAt: Math.floor(Date.now() / 1000) + refreshed.expires_in,
          error: undefined
        };
      } catch {
        // Swallow the failure into a session flag instead of throwing, so a
        // token hiccup shows as "SharePoint unavailable" for one section of
        // the dashboard rather than crashing the whole page.
        return { ...token, error: "RefreshAccessTokenError" as const };
      }
    },
    async session({ session, token }) {
      session.accessToken =
        typeof token.accessToken === "string" ? token.accessToken : undefined;
      session.error = token.error;
      return session;
    }
  },
  pages: {
    signIn: "/sign-in"
  },
  logger: {
    error(error) {
      console.error("[auth error]", error);
    }
  }
});
