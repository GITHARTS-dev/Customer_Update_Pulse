import { NextRequest, NextResponse } from "next/server";
import { readCeoLog, setAction, setView } from "@/lib/ceo-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const log = await readCeoLog();
  return NextResponse.json(log);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (body.type === "action") {
    if (typeof body.key !== "string") {
      return NextResponse.json({ error: "key required" }, { status: 400 });
    }
    await setAction(body.key, body.status);
    return NextResponse.json({ ok: true });
  }
  if (body.type === "view") {
    if (typeof body.programmeId !== "string") {
      return NextResponse.json({ error: "programmeId required" }, { status: 400 });
    }
    await setView(body.programmeId);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "invalid type" }, { status: 400 });
}
