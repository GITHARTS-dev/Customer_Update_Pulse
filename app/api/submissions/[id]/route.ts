import { NextResponse } from "next/server";
import { readSubmission } from "@/lib/store";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  const submission = await readSubmission(id);
  if (!submission) {
    return NextResponse.json(null, { status: 200 });
  }
  return NextResponse.json(submission);
}
