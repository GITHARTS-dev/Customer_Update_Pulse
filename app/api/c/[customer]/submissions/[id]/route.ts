import { NextResponse } from "next/server";
import { getCustomer } from "@/lib/customers";
import { readSubmission } from "@/lib/store";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ customer: string; id: string }>;
}

export async function GET(_req: Request, ctx: RouteContext) {
  const { customer: cid, id } = await ctx.params;
  const customer = getCustomer(cid);
  if (!customer) return NextResponse.json(null, { status: 200 });
  const submission = await readSubmission(customer, id);
  if (!submission) {
    return NextResponse.json(null, { status: 200 });
  }
  return NextResponse.json(submission);
}
