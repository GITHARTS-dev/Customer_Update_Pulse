import { NextResponse } from "next/server";
import { getCustomer } from "@/lib/customers";
import { resolveProgrammes } from "@/lib/programme-store";
import { routeTranscript, type RosterEntry } from "@/lib/transcript-router";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ customer: string }>;
}

interface RouteBody {
  transcript?: string;
}

// A spoken update is a couple of hundred words. Anything far beyond that is a
// stuck microphone repeating itself rather than a real week, and routing it
// would be slow and pointless, so it is refused rather than silently truncated.
const TRANSCRIPT_MAX = 20000;

/**
 * Turns one spoken update into a per-programme draft the lead then reviews.
 * Nothing here is persisted: the draft only populates the input page's cards,
 * and the lead still submits in the normal way. So a routing mistake costs a
 * drag of one sentence, never a wrong card in front of the CEO.
 */
export async function POST(req: Request, ctx: RouteContext) {
  const { customer: cid } = await ctx.params;
  const customer = getCustomer(cid);
  if (!customer) return NextResponse.json({ error: "Unknown customer" }, { status: 404 });

  let body: RouteBody;
  try {
    body = (await req.json()) as RouteBody;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const transcript = (body.transcript ?? "").trim();
  if (!transcript) {
    return NextResponse.json({ error: "Nothing was said yet." }, { status: 400 });
  }
  if (transcript.length > TRANSCRIPT_MAX) {
    return NextResponse.json(
      { error: "That update is too long to sort. Please shorten it a little." },
      { status: 413 }
    );
  }

  const roster: RosterEntry[] = (await resolveProgrammes(customer)).map((p) => ({
    id: p.id,
    name: p.name,
    shortName: p.shortName,
    lead: p.lead,
    subProgrammes: p.subProgrammes,
    jiraProjectKey: p.jiraProjectKey
  }));

  try {
    const routed = await routeTranscript(transcript, roster);
    return NextResponse.json(routed);
  } catch (err) {
    const message = (err as Error).message || "Could not sort that update.";
    console.error("[route-transcript] failed:", message);
    // The transcript itself is safe in the browser, so the lead loses nothing
    // by this failing - they can file the sentences by hand and still submit.
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
