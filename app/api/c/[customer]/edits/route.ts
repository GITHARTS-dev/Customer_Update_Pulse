import { NextResponse } from "next/server";
import { getCustomer } from "@/lib/customers";
import { resolveProgrammes, byIdOf } from "@/lib/programme-store";
import { readAllSubmissions, writeSubmission } from "@/lib/store";
import { writePortfolioOverride } from "@/lib/portfolio-store";
import type { OpenTopic, PulseSubmission, Signal, SignalKind } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Publishing a lead's hand-edits over what Claude wrote.
 *
 * Claude turns a check-in into a narrative and classified signals, but it can
 * only approximate what the lead meant - and this is sentiment, where "close
 * enough" often isn't. This route lets the lead correct the published wording
 * and have it shown to the CEO verbatim.
 *
 * Everything lands in the SAME places the original submission already uses
 * (ProgrammeUpdates / OpenDecisions columns, signals + essence inside
 * AIGeneratedJSON), so there is no second source of truth to reconcile - an
 * edit simply replaces the words. The one new marker is `edited`, which stops
 * the reader-side name redactor from rewriting the lead's own sentences.
 */

interface RouteContext {
  params: Promise<{ customer: string }>;
}

interface ProgrammeEdit {
  programmeId: string;
  aiNarrative?: string;
  signals?: Array<{ kind: string; text: string }>;
  openTopics?: Array<{ title: string }>;
}

interface EditBody {
  editedBy?: string;
  programmes?: ProgrammeEdit[];
  portfolio?: { headline?: string; supporting?: string };
}

const NARRATIVE_MAX = 600;
const SIGNAL_TEXT_MAX = 400;
const TOPIC_TITLE_MAX = 300;
const SIGNALS_MAX = 12;
const TOPICS_MAX = 12;
const VALID_KINDS: SignalKind[] = ["win", "watch", "ask"];

/** Keeps well-formed signals only, capped, blank text dropped. */
function cleanSignals(raw: Array<{ kind: string; text: string }>): Signal[] {
  const out: Signal[] = [];
  for (const s of raw) {
    const text = typeof s?.text === "string" ? s.text.trim() : "";
    if (!text) continue;
    const kind = VALID_KINDS.includes(s?.kind as SignalKind)
      ? (s.kind as SignalKind)
      : "watch";
    out.push({ kind, text: text.slice(0, SIGNAL_TEXT_MAX) });
    if (out.length >= SIGNALS_MAX) break;
  }
  return out;
}

/**
 * Keeps well-formed topics only, capped, blank titles dropped, deduped.
 *
 * Newlines are collapsed to spaces because topics are persisted as one
 * newline-delimited text column - a line break typed inside a point would come
 * back as two separate points (and bump the "open decisions" count).
 */
function cleanTopics(raw: Array<{ title: string }>): OpenTopic[] {
  const seen = new Set<string>();
  const out: OpenTopic[] = [];
  for (const t of raw) {
    const title =
      typeof t?.title === "string" ? t.title.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim() : "";
    if (!title) continue;
    const key = title.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title: title.slice(0, TOPIC_TITLE_MAX) });
    if (out.length >= TOPICS_MAX) break;
  }
  return out;
}

export async function POST(req: Request, ctx: RouteContext) {
  const { customer: cid } = await ctx.params;
  const customer = getCustomer(cid);
  if (!customer) return NextResponse.json({ error: "Unknown customer" }, { status: 404 });

  let body: EditBody;
  try {
    body = (await req.json()) as EditBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const programmeEdits = Array.isArray(body.programmes) ? body.programmes : [];
  const portfolio = body.portfolio;
  const hasPortfolio =
    portfolio !== undefined &&
    (typeof portfolio.headline === "string" || typeof portfolio.supporting === "string");

  if (programmeEdits.length === 0 && !hasPortfolio) {
    return NextResponse.json({ error: "Nothing to publish." }, { status: 400 });
  }

  const editedBy = (body.editedBy || customer.submitter || "the lead").slice(0, 80);
  const byId = byIdOf(await resolveProgrammes(customer));

  // Validate every programme edit up front, so a bad payload fails before
  // anything is written rather than leaving a half-published page.
  for (const edit of programmeEdits) {
    const programme = byId[edit.programmeId];
    if (!programme) {
      return NextResponse.json(
        { error: `Unknown programme: ${edit.programmeId}` },
        { status: 400 }
      );
    }
    if (edit.aiNarrative !== undefined && typeof edit.aiNarrative !== "string") {
      return NextResponse.json(
        { error: `${programme.name}: narrative must be text.` },
        { status: 400 }
      );
    }
    if (edit.aiNarrative !== undefined && !edit.aiNarrative.trim()) {
      return NextResponse.json(
        { error: `${programme.name}: the narrative cannot be empty.` },
        { status: 400 }
      );
    }
    if (edit.signals !== undefined && !Array.isArray(edit.signals)) {
      return NextResponse.json(
        { error: `${programme.name}: signals must be a list.` },
        { status: 400 }
      );
    }
    if (edit.openTopics !== undefined && !Array.isArray(edit.openTopics)) {
      return NextResponse.json(
        { error: `${programme.name}: discussion points must be a list.` },
        { status: 400 }
      );
    }
  }

  const at = new Date().toISOString();
  const saved: string[] = [];
  const failed: Array<{ programmeId: string; error: string }> = [];

  if (programmeEdits.length > 0) {
    const existingByProgramme = await readAllSubmissions(customer);

    for (const edit of programmeEdits) {
      const programme = byId[edit.programmeId];
      const previous = existingByProgramme[edit.programmeId];
      // An edit rewrites a published card; with nothing published yet there is
      // nothing to rewrite (and no vibe/Jira/week to invent), so this is a
      // check-in, not an edit.
      if (!previous) {
        failed.push({
          programmeId: edit.programmeId,
          error: `${programme.name} has no check-in yet, so there is nothing to edit.`
        });
        continue;
      }

      const next: PulseSubmission = { ...previous };
      if (edit.aiNarrative !== undefined) {
        next.aiNarrative = edit.aiNarrative.trim().slice(0, NARRATIVE_MAX);
        // Stamped ONLY for a narrative edit, because that is all the flag
        // governs: dropping the "written by Claude" caption, and switching off
        // the name redactor for that text. Stamping it for a discussion-point
        // edit would strip the attribution from - and disable redaction on - a
        // narrative Claude still wrote.
        next.edited = { at, by: editedBy };
      }
      if (edit.signals !== undefined) {
        next.signals = cleanSignals(edit.signals);
      }
      if (edit.openTopics !== undefined) {
        next.openTopics = cleanTopics(edit.openTopics);
      }

      try {
        await writeSubmission(customer, next);
        saved.push(edit.programmeId);
      } catch (err) {
        failed.push({ programmeId: edit.programmeId, error: (err as Error).message });
      }
    }
  }

  let portfolioError: string | null = null;
  if (hasPortfolio) {
    try {
      await writePortfolioOverride(
        customer,
        { headline: portfolio!.headline, supporting: portfolio!.supporting },
        editedBy
      );
    } catch (err) {
      portfolioError = (err as Error).message;
    }
  }

  // Nothing landed at all - report it as a failure so the bar keeps the edits
  // on screen instead of pretending they were published.
  if (saved.length === 0 && (hasPortfolio ? portfolioError !== null : true)) {
    const reasons = [...failed.map((f) => f.error), portfolioError]
      .filter(Boolean)
      .join("; ");
    return NextResponse.json(
      { error: reasons || "Could not publish these edits." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    saved,
    failed,
    portfolio: hasPortfolio ? (portfolioError ? { error: portfolioError } : { ok: true }) : null
  });
}
