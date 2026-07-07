import type { DefaultSession } from "next-auth";

type SessionError = "RefreshAccessTokenError" | "RefreshTokenMissing";

declare module "next-auth" {
  interface Session extends DefaultSession {
    accessToken?: string;
    error?: SessionError;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    error?: SessionError;
  }
}

// NextAuthConfig's callbacks (as invoked by the `NextAuth()` factory we call
// in auth.ts) resolve the JWT type from @auth/core/jwt directly rather than
// through the next-auth/jwt re-export, so both must be augmented.
declare module "@auth/core/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    error?: SessionError;
  }
}
