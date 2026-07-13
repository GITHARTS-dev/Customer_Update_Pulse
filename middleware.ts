import { NextResponse } from "next/server";
import { auth } from "@/auth";

export default auth((req) => {
  // One sign-in for the whole platform: the launchpad ("/"), the Pulse app
  // (/c/*) and the Invoice Dashboard (/invoice) are all gated by this single
  // NextAuth check. Sign in once → land on the launchpad → open either app with
  // no second prompt (the same session cookie carries through).
  if (!req.auth) {
    const signInUrl = new URL("/sign-in", req.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(signInUrl);
  }
});

export const config = {
  // .swa is excluded so Azure Static Web Apps' post-deploy health check
  // (a GET to /.swa/health.html) gets a real response instead of a redirect
  // to /sign-in, which Azure would read as a failed deployment.
  // `api/invoice` is excluded so the invoice Graph proxy returns proper JSON
  // status codes (e.g. 401) to the SPA's fetch instead of an HTML redirect.
  // `icon\\.png` (Next's App Router favicon convention) is excluded for the same
  // reason as favicon.ico — it must load on /sign-in itself, before any session.
  matcher: ["/((?!api/auth|api/invoice|sign-in|_next/static|_next/image|favicon\\.ico|icon\\.png|logos|\\.swa).*)"]
};
