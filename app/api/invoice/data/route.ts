import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { loadInvoiceData } from "@/lib/invoice-data";

/**
 * The Invoice Dashboard SPA's one data endpoint (replaces the old generic
 * Graph proxy). Auth rides the platform's single NextAuth sign-in - no
 * separate invoice sign-in. Fetching + parsing the workbook happens here,
 * server-side, so every sheet read shares one Graph workbook session and runs
 * concurrently, and the parsed result is cached across requests/users.
 * `?refresh=1` bypasses the cache for a user-triggered refresh.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "signed-out" }, { status: 401 });
  }
  if (session.error || !session.accessToken) {
    return NextResponse.json({ error: "needs-reauth" }, { status: 401 });
  }

  try {
    const force = request.nextUrl.searchParams.get("refresh") === "1";
    const data = await loadInvoiceData(session.accessToken, force);
    return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load invoice data" },
      { status: 502 }
    );
  }
}
