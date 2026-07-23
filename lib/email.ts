import "server-only";
import type { Person } from "./people";

/**
 * Email notifications, sent through Microsoft Graph as the signed-in user
 * (Sreema) via /me/sendMail. So a note or action lands in the lead's inbox
 * genuinely "from Sreema", reusing the same Microsoft session that already
 * powers SharePoint - no separate email service or key. Requires the Mail.Send
 * delegated permission on the Entra app (see auth.ts SCOPE + docs/azure-swa.md).
 *
 * Every send is best-effort: a failure here is logged and swallowed so the
 * underlying action/note still saves. The browser is never blocked on email.
 */

/** person id → work mailbox. Kept server-side so addresses never ship to the client. */
const EMAIL_BY_PERSON: Record<string, string> = {
  srimathi: "Srimathi.Ravi@globalharts.com",
  savio: "Savio.abraham@globalharts.com"
};

export function emailForPerson(person: Person): string | undefined {
  return EMAIL_BY_PERSON[person.id];
}

const GRAPH_SENDMAIL = "https://graph.microsoft.com/v1.0/me/sendMail";

interface SendArgs {
  accessToken: string;
  to: string;
  subject: string;
  text: string;
}

/** Low-level Graph sendMail. Returns true on success (HTTP 202), false otherwise. */
async function sendMail({ accessToken, to, subject, text }: SendArgs): Promise<boolean> {
  try {
    const res = await fetch(GRAPH_SENDMAIL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      cache: "no-store",
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "Text", content: text },
          toRecipients: [{ emailAddress: { address: to } }]
        },
        saveToSentItems: true
      })
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[email] sendMail ${res.status}: ${body.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] sendMail failed:", (err as Error).message);
    return false;
  }
}

const SIGN_OFF = "\n\nSent from HARTS Pulse.";

/** Notifies a lead that Sreema responded to one of their asks with an action. */
export async function notifyActionEmail(args: {
  accessToken: string;
  to: Person;
  programmeName: string;
  askText: string;
  statusLabel: string;
}): Promise<boolean> {
  const address = emailForPerson(args.to);
  if (!address) return false;
  const subject = `Sreema responded on ${args.programmeName}`;
  const text =
    `Hi ${args.to.first},\n\n` +
    `Sreema marked this as "${args.statusLabel}" on ${args.programmeName}:\n\n` +
    `  "${args.askText}"\n\n` +
    `Open the check-in to see it in context.${SIGN_OFF}`;
  return sendMail({ accessToken: args.accessToken, to: address, subject, text });
}

/** Delivers Sreema's per-ask note to the chosen (or default) lead. */
export async function notifyNoteEmail(args: {
  accessToken: string;
  to: Person;
  programmeName: string;
  askText: string;
  note: string;
}): Promise<boolean> {
  const address = emailForPerson(args.to);
  if (!address) return false;
  const subject = `A note from Sreema on ${args.programmeName}`;
  const text =
    `Hi ${args.to.first},\n\n` +
    `Sreema left you a note on ${args.programmeName}` +
    (args.askText ? `, about:\n\n  "${args.askText}"\n\n` : ":\n\n") +
    `${args.note}\n\n` +
    `You'll also see it on your check-in.${SIGN_OFF}`;
  return sendMail({ accessToken: args.accessToken, to: address, subject, text });
}
