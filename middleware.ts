import { NextResponse } from "next/server";
import { auth } from "@/auth";

export default auth((req) => {
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
  matcher: ["/((?!api/auth|sign-in|_next/static|_next/image|favicon\\.ico|logos|\\.swa).*)"]
};
