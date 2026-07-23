import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCustomer } from "@/lib/customers";
import { resolveProgrammes, byIdOf } from "@/lib/programme-store";
import { readCeoLog, setAction, setLeadView, setNote, setView } from "@/lib/ceo-store";
import { ACTION_LABEL, type ActionStatus } from "@/lib/actions";
import { defaultPersonForLead, personById, type Person } from "@/lib/people";
import { notifyActionEmail, notifyNoteEmail } from "@/lib/email";
import { refineNote } from "@/lib/claude";

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
    await setAction(customer, body.key, body.status, {
      askText: typeof body.askText === "string" ? body.askText : undefined,
      programmeId: typeof body.programmeId === "string" ? body.programmeId : undefined
    });
    // Notify the lead by email whenever Sreema records a concrete response
    // (not on undo). Best-effort - a mail failure never fails the click.
    if (body.status !== "open" && typeof body.programmeId === "string") {
      const p = byIdOf(await resolveProgrammes(customer))[body.programmeId];
      if (p) {
        await sendActionMail({
          to: defaultPersonForLead(p.lead),
          programmeName: p.name,
          askText: typeof body.askText === "string" ? body.askText : "",
          status: body.status as ActionStatus
        });
      }
    }
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
    if (typeof body.key !== "string" || typeof body.text !== "string") {
      return NextResponse.json({ error: "key and text required" }, { status: 400 });
    }
    const programmeId = typeof body.programmeId === "string" ? body.programmeId : undefined;
    const p = programmeId
      ? byIdOf(await resolveProgrammes(customer))[programmeId]
      : undefined;
    // Recipient: the @mentioned person if valid, else the programme's default lead.
    const mentioned = personById(typeof body.to === "string" ? body.to : undefined);
    const recipient = mentioned ?? (p ? defaultPersonForLead(p.lead) : undefined);
    const askText = typeof body.askText === "string" ? body.askText : "";

    // Light copyedit before it's saved/emailed: fixes spelling, grammar and
    // casing, and softens the tone, without turning it into new content.
    const text = await refineNote(body.text);

    await setNote(customer, body.key, {
      text,
      to: recipient?.id,
      askText,
      programmeId
    });

    // Only email on an actual (non-empty) note, to the resolved recipient.
    if (text && recipient && p) {
      await sendNoteMail({
        to: recipient,
        programmeName: p.name,
        askText,
        note: text
      });
    }
    return NextResponse.json({ ok: true, text });
  }

  return NextResponse.json({ error: "invalid type" }, { status: 400 });
}

/** The signed-in user's Graph token, used to send mail as them (Sreema). */
async function senderToken(): Promise<string | undefined> {
  const session = await auth();
  return session?.accessToken;
}

async function sendActionMail(args: {
  to: Person;
  programmeName: string;
  askText: string;
  status: ActionStatus;
}): Promise<void> {
  try {
    const accessToken = await senderToken();
    if (!accessToken) return;
    await notifyActionEmail({
      accessToken,
      to: args.to,
      programmeName: args.programmeName,
      askText: args.askText,
      statusLabel: ACTION_LABEL[args.status]
    });
  } catch (err) {
    console.error("[ceo-log] action email failed:", (err as Error).message);
  }
}

async function sendNoteMail(args: {
  to: Person;
  programmeName: string;
  askText: string;
  note: string;
}): Promise<void> {
  try {
    const accessToken = await senderToken();
    if (!accessToken) return;
    await notifyNoteEmail({
      accessToken,
      to: args.to,
      programmeName: args.programmeName,
      askText: args.askText,
      note: args.note
    });
  } catch (err) {
    console.error("[ceo-log] note email failed:", (err as Error).message);
  }
}
