import { NextRequest, NextResponse } from "next/server";
import { getCustomer } from "@/lib/customers";
import { readCeoLog, setAction, setLeadView, setNote, setView } from "@/lib/ceo-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ customer: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { customer: cid } = await ctx.params;
  const customer = getCustomer(cid);
  if (!customer) return NextResponse.json({ error: "Unknown customer" }, { status: 404 });
  const log = await readCeoLog(customer);
  return NextResponse.json(log);
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { customer: cid } = await ctx.params;
  const customer = getCustomer(cid);
  if (!customer) return NextResponse.json({ error: "Unknown customer" }, { status: 404 });

  const body = await req.json();
  if (body.type === "action") {
    if (typeof body.key !== "string") {
      return NextResponse.json({ error: "key required" }, { status: 400 });
    }
    await setAction(customer, body.key, body.status);
    return NextResponse.json({ ok: true });
  }
  if (body.type === "view") {
    if (typeof body.programmeId !== "string") {
      return NextResponse.json({ error: "programmeId required" }, { status: 400 });
    }
    await setView(customer, body.programmeId);
    return NextResponse.json({ ok: true });
  }
  if (body.type === "leadView") {
    if (typeof body.programmeId !== "string") {
      return NextResponse.json({ error: "programmeId required" }, { status: 400 });
    }
    await setLeadView(customer, body.programmeId);
    return NextResponse.json({ ok: true });
  }
  if (body.type === "note") {
    if (typeof body.programmeId !== "string" || typeof body.text !== "string") {
      return NextResponse.json({ error: "programmeId and text required" }, { status: 400 });
    }
    await setNote(customer, body.programmeId, body.text);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "invalid type" }, { status: 400 });
}
