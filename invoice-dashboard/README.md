# Harts Customer Invoice Dashboard

React (Vite) dashboard for the EVORA monthly invoice workbook. **This is not a
standalone deployment** — it is built separately and served as static files
by the main HARTS platform app (the Next.js project one level up), at
`/invoice`. See that project's `docs/azure-swa.md` for the actual deployment
process; this file only covers what's specific to working on this subfolder.

> An earlier version of this app deployed on its own (its own Azure Static Web
> App, its own MSAL sign-in, its own Entra app registrations, and a companion
> Azure Function reading Graph). None of that exists any more — there is no
> `api/` folder, no MSAL, and no separate sign-in. All of it was replaced by
> the platform's single NextAuth sign-in and a same-origin server endpoint.
> If you find old docs, screenshots, or Entra apps referencing that setup,
> they're stale.

## How it fits together now

```
Browser ── one NextAuth sign-in ──▶ HARTS platform (Next.js, Azure SWA)
                                          │
                                          ├── /                 (launchpad)
                                          ├── /c/*               (Customer Update Pulse)
                                          └── /invoice           (THIS app, static files)
                                                 │
                                                 └── /api/invoice/data
                                                        │
                                                        └── Microsoft Graph, using the
                                                            signed-in user's own session
                                                            token (delegated scope,
                                                            requested in the platform's
                                                            auth.ts)
```

- This app has **no server of its own** and reads **no secrets** — it's a
  static React bundle that calls `/api/invoice/data` (implemented in
  `lib/invoice-data.ts` and `app/api/invoice/data/route.ts` in the parent
  project) and renders whatever JSON comes back.
- The one Graph call this app used to make client-side (resolving
  `SHAREPOINT_SHARE_URL` and reading the workbook's sheets) now happens
  **server-side**, sharing one Graph "workbook session" across all sheet
  reads and caching the parsed result for a few minutes — see the parent
  project's `lib/invoice-data.ts` for why (opening an Excel workbook per
  read, per sheet, was the original performance bottleneck).
- Sign-in, sign-out, and access control are entirely the platform's — there
  is nothing to configure here.

## Working on this app locally

```bash
cd invoice-dashboard
npm install
npm run dev        # Vite dev server — but see note below
```

Running `npm run dev` here only gets you the raw component tree; it will not
have a working `/api/invoice/data` to call (that route lives in the parent
Next.js app). To actually exercise data loading, run the **parent** app
instead (`npm run dev` from the repo root) and open `/invoice` there — Next's
dev server proxies straight to your local source via the same Vite build the
production path uses.

## Shipping a change

The parent app's CI build does **not** build this subfolder — it serves
whatever is already committed under the parent's `public/invoice/`. After
changing anything here:

```bash
# from the repo root
npm run build:invoice
```

This builds this app (`vite build`, with `base: "/invoice/"` so every asset
path resolves under the `/invoice` mount) and copies the output into
`public/invoice/`. Commit that refreshed folder along with your source change
— if you forget, production keeps serving the old build.

## Workbook layout (the server's `lib/invoice-data.ts` expects this)

Sheets `Jan26 … Jun26` on the workbook at `SHAREPOINT_SHARE_URL` (defined in
the parent project's `lib/invoice-data.ts`), with each sheet laid out as:

```
Row 1: <date> | Hours | Days | Daily Rate | Total | _ | HARTS Pay | Diff | Profit % | _
Then per person:
  - a name-only row in column A
  - one row per project with Hours / Rate / Total
  - on the first project row, columns F–I hold the person rollups
  (HARTS Pay column = G)
Then "Service Fee Total" row, "Expenses Total", "SUM", "Tax 19%", "Net Total".
```

If the sheet names or columns change, update `MONTHLY_SHEETS` and
`parseRows()` in the parent project's `lib/invoice-data.ts` (not anything in
this folder — the parsing logic lives server-side now).
