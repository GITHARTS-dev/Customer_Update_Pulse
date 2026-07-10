import { NextRequest, NextResponse } from "next/server";
import { getCustomer } from "@/lib/customers";
import { addProgramme, removeProgramme, resolveProgrammes } from "@/lib/programme-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ customer: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { customer: cid } = await ctx.params;
  const customer = getCustomer(cid);
  if (!customer) return NextResponse.json({ error: "Unknown customer" }, { status: 404 });
  const programmes = await resolveProgrammes(customer);
  return NextResponse.json({ programmes });
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { customer: cid } = await ctx.params;
  const customer = getCustomer(cid);
  if (!customer) return NextResponse.json({ error: "Unknown customer" }, { status: 404 });

  let body: {
    action?: string;
    name?: string;
    lead?: string;
    jiraProjectKey?: string;
    programmeId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    if (body.action === "add") {
      if (typeof body.name !== "string" || body.name.trim().length === 0) {
        return NextResponse.json({ error: "A programme name is required." }, { status: 400 });
      }
      const programme = await addProgramme(customer, {
        name: body.name,
        lead: typeof body.lead === "string" ? body.lead : "",
        jiraProjectKey: typeof body.jiraProjectKey === "string" ? body.jiraProjectKey : ""
      });
      return NextResponse.json({ programme });
    }
    if (body.action === "remove") {
      if (typeof body.programmeId !== "string") {
        return NextResponse.json({ error: "programmeId required" }, { status: 400 });
      }
      await removeProgramme(customer, body.programmeId);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
