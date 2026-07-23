/**
 * The CEO's response options on an ask - shared by the client buttons, the
 * server route, and the email composer, so the labels never drift. Client-safe
 * (no server-only imports), unlike ceo-store which persists them.
 */
export type ActionStatus = "need_info" | "noted" | "lets_talk";

export const ACTION_ORDER: ActionStatus[] = ["need_info", "noted", "lets_talk"];

export const ACTION_LABEL: Record<ActionStatus, string> = {
  need_info: "Need more info",
  noted: "Noted",
  lets_talk: "Let's talk"
};
