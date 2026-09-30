# HARTS Pulse — developer handover

You are taking over a small Next.js app that HARTS uses to show a customer's
CEO how their programmes are *feeling*, not how their tickets are doing. This
document is the knowledge transfer: what the product is, how a week of data
flows through it, where the surprises are, and how to do the jobs you will
actually be asked to do.

Read the first two sections before touching anything. Most of the code makes
sense only once you have the product idea.

---

## 1. What this is

HARTS runs eight programmes for **Evora Group**. Once a week, one project lead
writes a check-in for each programme. Claude turns each check-in into a short,
warm narrative plus a few classified signals. The CEO (Sreema) opens a
dashboard and reads the portfolio at a glance: what is going well, what needs
watching, and where a decision from her would help. She can reply to any single
ask, and the lead sees that reply on their next check-in.

Two audiences, two surfaces:

| Who | Surface | What they do |
|---|---|---|
| The lead | `/c/evora/input` | Speaks or types the week's update |
| The CEO | `/c/evora` and `/c/evora/programme/<id>` | Reads the pulse, responds to asks |

There is a second, unrelated app in this repo — an invoice dashboard — served
at `/invoice`. It shares only the sign-in. See §11.

## 2. The one idea that explains the design

**This is sentiment, not status.** Everything unusual in the codebase follows
from that.

Because it is sentiment, the product only works if the CEO trusts that what she
reads is really what the lead meant. So three rules are enforced in code, not
just in prompts, and you should treat them as load-bearing:

1. **Claude never writes a signal.** It only *classifies* the lead's own
   sentences. The lead's exact words are shown to the CEO. See
   `signalCandidates` / `mapSignals` in [lib/claude.ts](lib/claude.ts) — Claude
   is given numbered sentences and returns numbers, never text. The same trick
   is used again by the voice router (§6).
2. **No person's name reaches the CEO.** The prompt says so, and
   [lib/redact.ts](lib/redact.ts) strips names again at read time as a
   deterministic safety net, so the guarantee also holds for rows written
   before that rule existed. The one exception is a card the lead hand-edited
   and published — those are their own words, deliberately, and are shown
   untouched.
3. **The lead can always overrule Claude.** Any published narrative, essence or
   signal can be hand-edited and republished verbatim
   ([app/api/c/[customer]/edits/route.ts](app/api/c/%5Bcustomer%5D/edits/route.ts)).

If you are ever unsure whether a change is acceptable, ask: *could this put
words in front of the CEO that the lead did not say?* If yes, it is wrong.

## 3. Run it locally

```bash
nvm use 20              # engines: >=20 <21
npm install
cp .env.example .env.local
npm run dev             # http://localhost:3000
```

Fill `.env.local` as far as you can. What each group unlocks:

| Variable(s) | Without it |
|---|---|
| `ANTHROPIC_API_KEY` | Submitting a check-in fails. Everything else works. |
| `AUTH_SECRET`, `AZURE_TENANT_ID`, `AZURE_CLIENT_ID` | You cannot sign in at all. |
| `SHAREPOINT_SITE_ID`, `SP_LIST_SUBMISSIONS` | No submissions persist; the CEO log falls back to a local JSON file under `data/`. |
| `JIRA_*` | Jira counts stay at the previous snapshot. Entirely optional. |
| `ALLOWED_EMAILS` | No app-level allowlist; Entra assignment is the only gate. |

Two things that will confuse you early:

- **ESLint is not configured.** `npm run lint` drops into an interactive
  "how would you like to configure ESLint?" prompt. Use `npm run typecheck`
  (`tsc --noEmit`) as the real check. It is fast and it is what CI effectively
  relies on.
- The Entra app is registered as a **public client (PKCE)**. There is no client
  secret, and you should not add one. See [auth.ts](auth.ts).

## 4. The map

```
app/
  page.tsx                          launchpad (static, no session read)
  sign-in/                          sign-in screen
  c/[customer]/
    page.tsx                        CEO pulse — the portfolio view
    programme/[id]/page.tsx         CEO detail — one programme
    input/page.tsx                  the lead's weekly check-in
    layout.tsx                      per-customer shell, sets the --accent theme
  api/c/[customer]/
    submissions/                    POST a week's check-ins (the main pipeline)
    route-transcript/               POST a spoken update, get a per-programme draft
    edits/                          publish the lead's hand-edits
    ceo-log/                        the CEO's responses, notes and "viewed" marks
    programmes/                     add/remove a programme at runtime
    attachments/                    file upload to SharePoint
lib/                                all business logic (see §12)
components/                         presentational + a few stateful widgets
docs/azure-swa.md                   deployment. Read it before you deploy.
```

Pages under `/c/*` are `force-dynamic` — the data is always live. The launchpad
is deliberately static so it can never re-enter an old redirect loop.

## 5. How one week flows through the system

This is the core of the handover. Follow it once end to end.

**1 — The lead speaks their week.** On the input page, they press the mic and
talk through all eight programmes in one go.
[lib/speech.ts](lib/speech.ts) wraps the browser's Web Speech API (Chrome/Edge
only, `en-IN`, auto-restarts on a pause so a silence does not end the session).
The transcript appears in an **editable box**. That box is not cosmetic — it is
the accuracy net, because signals reach the CEO verbatim.

**2 — The transcript is routed into programmes.**
`POST /api/c/[customer]/route-transcript` →
[lib/transcript-router.ts](lib/transcript-router.ts). The transcript is split
into sentences server-side; Claude is given the numbered sentences plus a
roster of programmes and returns **only indices**. Nothing is persisted here —
it just pre-fills the cards. Programmes the lead did not mention are left out
of the week entirely; silence never becomes an invented update. Anything Claude
could not place comes back as `unassigned` and the lead files it by hand.

**3 — The lead reviews and submits.** The per-programme cards (vibe, open
decisions, own words, attachments) are now the *review* surface. `vibe` is
pre-selected from Claude's read but only counts once the lead submits, because
the whole CEO page keys off that one field.

**4 — The submission pipeline.**
`POST /api/c/[customer]/submissions` does, in order:

1. Validates every entry (known programme, valid vibe, own words are real prose).
2. Fetches a Jira snapshot per programme — and silently falls back to the
   previous snapshot if Jira is unconfigured or erroring.
3. Calls Claude **once for all programmes** (`generateNarratives`) to get a
   narrative, an essence and classified signals for each.
4. Upserts one SharePoint row **per programme per week**.

**5 — The CEO reads it.** `/c/evora` recomputes the portfolio mood from the
latest row per programme. Names are stripped at read time. She can mark an ask
Noted / Need more info / Let's talk, or write a short note — which is
copyedited by Claude (`refineNote`), saved to the CEO log, and emailed to the
lead through Microsoft Graph as *her*.

**6 — The loop closes.** Next week the lead's input page shows Sreema's replies
against the asks that prompted them.

## 6. The Claude layer

Three calls, all in `lib/`. No other code talks to the API.

| Call | Where | Model | Job |
|---|---|---|---|
| `generateNarratives` | [lib/claude.ts](lib/claude.ts) | `claude-sonnet-4-6` | Narrative + essence + signal classification, all programmes in one request |
| `routeTranscript` | [lib/transcript-router.ts](lib/transcript-router.ts) | `claude-opus-5` | Splits one spoken update across programmes |
| `refineNote` | [lib/claude.ts](lib/claude.ts) | `claude-sonnet-4-6` | Light copyedit of the CEO's reply. Best-effort — returns the original on failure |

**On cost.** People worry about this more than the numbers justify. A full
eight-programme week is roughly **$0.04–0.06** across both the router and the
narrative call — about **$3 a year**. The narrative call is already batched,
which is where the saving comes from. Do not add prompt caching (weekly
cadence, five-minute TTL, prefix too short — it will never hit).

Two open items the previous owner left deliberately:

- `MODEL` in [lib/claude.ts](lib/claude.ts) is still `claude-sonnet-4-6`.
  Moving to `claude-sonnet-5` is both cheaper and newer, but it writes the
  narratives whose voice has been tuned carefully — change it deliberately and
  read the output, don't do it as a drive-by.
- Billing is a **prepaid credit**. The real risk is not spend, it is the credit
  hitting zero mid-demo. Move it to auto-reload with a monthly cap.

**The prompts are the product.** `COMMON_RULES` in
[lib/claude.ts](lib/claude.ts) encodes voice, altitude, kindness and integrity
rules that took real iteration (no em-dashes, no jargon, no ticket counts, no
names, 1–2 sentences). Treat edits there as product changes, not refactors.

## 7. Storage: one SharePoint list does everything

The most surprising part of the codebase, so read this carefully.

Each customer has **one** SharePoint list. It holds:

- **One row per programme per week.** Never deleted, which is why the
  checkpoint feature ([lib/snapshot-store.ts](lib/snapshot-store.ts)) works
  with no extra capture — past weeks are simply already there.
- **Three sentinel rows**, identified by `Title` and carrying JSON in the
  `AIGeneratedJSON` column. They have no `ProgrammeId`, so ordinary submission
  reads skip them:

  | Sentinel | Holds |
  |---|---|
  | `__ceo_log__` | CEO actions, notes, "viewed" marks |
  | `__programmes__` | Runtime added/removed programmes, as deltas over the code config |
  | `__portfolio__` | Hand-edited portfolio headline and supporting line |

  This exists so Azure's read-only filesystem needs no database and no second
  list. Locally, with no SharePoint configured, these fall back to JSON files
  under `data/`.

Things that will bite you:

- **Plain columns are authoritative.** `AIGeneratedJSON` is a machine copy used
  only for fields with no column of their own (essence, signals, the full Jira
  breakdown), and only when it still matches the row's identity.
- **Upsert matches on programme + week + *year*.** Week numbers restart every
  January; matching on the number alone once destroyed a whole week a year
  later. Do not "simplify" that check.
- **All reads go through `fetchSubmissionsListItems`**
  ([lib/submissions-fetch.ts](lib/submissions-fetch.ts)), which is React-cached
  per request. Submissions, trend history, CEO log and programme overrides all
  read the same list and hit Graph **once**. Bypass it and you will quadruple
  the Graph calls per page.

## 8. Auth

One NextAuth sign-in covers the whole platform — launchpad, Pulse and the
invoice app. [middleware.ts](middleware.ts) gates everything except a short,
deliberately-chosen exclusion list (SWA's health check, the invoice API, the
sign-in page, static assets). Each exclusion has a comment explaining why;
none are accidental.

Microsoft Entra ID, public client with PKCE and no secret. The session carries
a Graph access token used for both SharePoint and `/me/sendMail`, so emails
genuinely come from the signed-in user. `offline_access` is in the scope
because without it the session dies after about an hour.

There is a **refresh-token race guard** in [auth.ts](auth.ts): two open tabs
would otherwise both refresh, and Microsoft's rotating refresh tokens reject
the loser. Keep it.

## 9. Multi-tenant

Evora is live; GMR is a `comingSoon` placeholder. A customer is the top-level
tenant: its own programmes, its own SharePoint list, its own accent colour and
logo.

The split that matters: [lib/customers.ts](lib/customers.ts) is **client-safe**
(display config only), while [lib/customer-lists.ts](lib/customer-lists.ts) is
**server-only** and holds the SharePoint list ids. Never move a list id into
the client-safe file.

Theming works by setting the customer's accent as `--accent` (RGB channels) on
the layout wrapper, so every `bg-coral/10`-style Tailwind utility re-themes
automatically. `coral` and `violet` are aliases of the same variable.

## 10. Common tasks

**Add a programme permanently** → add to `PROGRAMMES` in
[lib/programmes.ts](lib/programmes.ts). (Leads can also add one at runtime from
the input page; that is stored as a delta in the `__programmes__` sentinel.)

**Change how narratives sound** → `COMMON_RULES` in
[lib/claude.ts](lib/claude.ts). Submit a real check-in afterwards and read the
output; there are no tests for voice.

**Add a person the CEO can @mention** → [lib/people.ts](lib/people.ts) for the
display name, and `EMAIL_BY_PERSON` in [lib/email.ts](lib/email.ts) for the
address. Addresses stay server-side on purpose.

**Add a customer** → an entry in [lib/customers.ts](lib/customers.ts), its list
id in [lib/customer-lists.ts](lib/customer-lists.ts), a logo in `public/logos/`,
and a new `SP_LIST_SUBMISSIONS_<ID>` env var.

**Swap speech-to-text** → [lib/speech.ts](lib/speech.ts) only. It is deliberately
a one-file seam. The current browser recogniser is free but Chrome-only and
round-trips audio through Google; Azure AI Speech is the intended replacement
(the tenant already runs on Microsoft) and handles `en-IN` plus a custom phrase
list of programme and lead names far better.

## 11. The invoice dashboard

`invoice-dashboard/` is a separate Vite SPA, built independently and committed
as static files into `public/invoice/`. It is **not** part of `npm run build` —
that is on purpose, so the Next.js deploy never has to install its dependencies.

After changing anything under `invoice-dashboard/`:

```bash
npm run build:invoice     # then commit the refreshed public/invoice/
```

Its README documents an older architecture that no longer exists (separate SWA,
MSAL, an Azure Function). The README itself flags this. Ignore anything you
find referencing that setup.

## 12. Where the logic lives

| File | Responsibility |
|---|---|
| [lib/claude.ts](lib/claude.ts) | Narrative + signal generation, note copyediting, the prompts |
| [lib/transcript-router.ts](lib/transcript-router.ts) | One spoken update → per-programme draft |
| [lib/speech.ts](lib/speech.ts) | Browser speech capture, behind a swappable interface |
| [lib/store.ts](lib/store.ts) | Submissions read/write, SharePoint column mapping |
| [lib/ceo-store.ts](lib/ceo-store.ts) | CEO actions, notes, view marks |
| [lib/programme-store.ts](lib/programme-store.ts) | Runtime programme add/remove |
| [lib/portfolio-store.ts](lib/portfolio-store.ts) | Hand-edited portfolio wording |
| [lib/snapshot-store.ts](lib/snapshot-store.ts) | Past-week checkpoints |
| [lib/history-store.ts](lib/history-store.ts) | Vibe trend over time (vibe only — deliberately not percentages) |
| [lib/redact.ts](lib/redact.ts) | Read-time name stripping |
| [lib/sharepoint.ts](lib/sharepoint.ts) | Raw Microsoft Graph calls |
| [lib/submissions-fetch.ts](lib/submissions-fetch.ts) | The single cached list read |
| [lib/jira.ts](lib/jira.ts) | Optional Jira snapshot |
| [lib/email.ts](lib/email.ts) | Graph `/me/sendMail`, best-effort |
| [lib/helpers.ts](lib/helpers.ts) | ISO weeks, vibe colours, freshness, phrasing |

## 13. Deploying

Azure Static Web Apps, hybrid Next.js, on push to `main`. **Read
[docs/azure-swa.md](docs/azure-swa.md) before your first deploy** — it covers
the environment variables, the Entra redirect URI, the Free-plan cost ceiling,
and the rough edges of hybrid Next.js on SWA, which is still a preview feature.

One detail worth knowing now: `npm run build` runs
`scripts/copy-standalone-assets.mjs` after `next build`, because Next's
standalone output omits static assets and `public/`, which SWA needs alongside
the server.

## 14. Honest state of things

- **No automated tests.** `npm run typecheck` is the only gate. Changes to
  prompts, narrative voice and routing accuracy are verified by submitting a
  real check-in and reading the result.
- **Voice input is new** (September 2026) and replaced four form fields per
  programme — thirty-two boxes for eight programmes. It has been typechecked
  and built, but at handover it had not yet been exercised against the live
  Claude API with a real spoken update. Do that early.
- **Voice is Chrome/Edge only** and sends audio to Google's recogniser. That was
  an accepted trade-off to ship without provisioning Azure Speech. If anyone
  raises data governance, §10 has the swap path.
- **Known routing limitation:** two programmes spoken in one unbroken breath
  become a single sentence and route to one programme. The fix is already
  available to the lead — add a full stop in the transcript box before sorting.
