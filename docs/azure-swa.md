# Deploying to Azure Static Web Apps

> **The three rules that make this app work on SWA (learned the hard way):**
>
> 1. **`output: "standalone"` is REQUIRED.** This app's `node_modules` is
>    ~397 MB, over SWA's 250 MB hybrid-app cap. Per Microsoft's own docs,
>    standalone is exactly the fix — it traces only the runtime dependencies
>    actually used, producing a ~55 MB deployable folder. (An earlier version
>    of this doc said the opposite — that was wrong and cost a debugging
>    session. Standalone off = every dynamic route 404s because the deploy
>    exceeds the size SWA will actually serve.)
> 2. **Every dynamic route segment (`[customer]`, `[id]`) MUST export
>    `generateStaticParams`** listing its known paths, even though the pages are
>    `force-dynamic`. SWA only routes a dynamic segment it has been told exists;
>    without `generateStaticParams` it doesn't know `/c/evora` is a route and
>    serves its static 404. `force-dynamic` still applies, so the pages render
>    live at request time — `generateStaticParams` only *registers* the paths.
>    (Programmes added at runtime aren't in the list, so their individual detail
>    page may 404 on SWA until the next deploy; the pulse board still shows them.)
> 3. **Exactly one `staticwebapp.config.json`, at the repo root, with no
>    catch-all rewrite.** SWA's `app_location` is `/` (the whole repo), so it
>    will pick up *any* `staticwebapp.config.json` it finds anywhere under that
>    path — including in an unrelated subfolder. This repo once had two stray
>    copies inside `invoice-dashboard/` (from when that was a separate SPA
>    deploy) with a `"routes": [{"route": "/*", "rewrite": "/index.html"}]`
>    rule. SWA used that one instead of intending nothing, rewrote every
>    request to `/index.html`, and the auth middleware looped on it forever
>    (`ERR_TOO_MANY_REDIRECTS`). The fix was deleting those stray files and
>    keeping a single root-level config with only security headers — no
>    `routes`, no `navigationFallback`. If you ever add another sub-project to
>    this repo, make sure it has no `staticwebapp.config.json` of its own.

This app is built to run on Azure Static Web Apps (SWA) **Free plan**. The one
rule SWA imposes that shaped the architecture: **the filesystem is read-only at
runtime** — nothing can be written to disk. That is why *all* persistent state
lives in SharePoint lists via Microsoft Graph, not in local JSON files.

## What this deployment actually serves

One SWA resource, one URL, behind **one sign-in**:

| Path | What it is | Auth |
| --- | --- | --- |
| `/` | The HARTS launchpad (two tiles) | NextAuth (this middleware) |
| `/c/<customer>` , `/c/<customer>/programme/<id>` , `/c/<customer>/input` | Customer Update Pulse (Next.js) | Same NextAuth session |
| `/invoice` | Invoice Dashboard — a **separate Vite SPA**, served as static files, reading data through `/api/invoice/data` | Same NextAuth session (no separate sign-in) |

The Invoice Dashboard used to be its own deploy with its own MSAL sign-in and
its own Entra app registration. It is now folded into this app: built
independently (`npm run build:invoice`), its output copied into
`public/invoice/`, and served by Next's rewrite for `/invoice` in
`next.config.mjs`. **Its old Entra app registration is no longer used** — it
authenticates through the platform's session instead. If you ever change
anything under `invoice-dashboard/`, run `npm run build:invoice` and commit the
refreshed `public/invoice/` — that build is *not* part of the CI pipeline, so
the committed static files are what actually ships.

## What makes it eligible

- **No runtime disk writes.** Submissions and the CEO log both persist to
  SharePoint (see below). Production never touches disk.
- **Hybrid Next.js, not static export.** There is no `output: "export"` — the
  app uses server components, API routes (`runtime = "nodejs"`), middleware,
  and per-request auth. SWA's **hybrid Next.js support** (currently in
  **public preview** at Microsoft) runs this on a managed backend automatically
  included on every plan, including Free.
- **One deploy workflow only.** Azure generates
  `.github/workflows/azure-static-web-apps-<name>.yml` with the resource's
  deployment-token secret. Keep exactly that one — a second workflow firing on
  the same `push` races and clobbers the first.
- **Middleware excludes a handful of paths from the sign-in gate**: `api/auth`
  (NextAuth's own routes), `api/invoice` (so the invoice's data fetch returns a
  clean JSON 401 instead of an HTML redirect), `sign-in`, `_next/static`,
  `_next/image`, `favicon.ico`, `icon.png` (the app's favicon — it must load
  on the sign-in page itself, before any session exists), `logos`, and
  `.swa` (SWA's own post-deploy health check, `GET /.swa/health.html` — without
  this exclusion the health check gets redirected to `/sign-in` and Azure
  reports the deployment as failed). See `middleware.ts`'s `matcher`.
- **Node 20** is pinned in `package.json` (`engines.node`).

## Known rough edges (hybrid Next.js is a *preview* feature)

Microsoft's own docs still label hybrid Next.js support "preview" as of their
most recent update. Two things worth knowing before you deploy:

1. **Environment variables must be set in two places for some setups**: the
   GitHub Actions workflow's `env:` block (build time) and the SWA resource's
   **Configuration → Environment variables** (request time). This app reads
   every secret at request time only (no page needs a secret at build time),
   so Configuration alone is sufficient — but if anything ever looks
   unconfigured after deploy, check both places before assuming it's broken.
2. **A handful of community reports** describe `process.env` reading as empty
   in hybrid Next.js apps on SWA. In every case traceable to a root cause, it
   was the build-time-only mistake above, not a platform bug. Still: **treat
   the first post-deploy check-in as a real test**, not a formality. If a run
   fails, the app's own error messages name the exact missing variable (e.g.
   `"SharePoint is not configured (SHAREPOINT_SITE_ID)"`) — check those, or the
   Log stream, before assuming anything is wrong with the app itself.

## One-time setup

### 1. Where the CEO log lives (nothing to do)

The CEO log (decision touches, "viewed" marks, notes to leads) needs a home
that isn't the disk. It always lives **inside that customer's own submissions
list** — one extra sentinel row (Title `__ceo_log__`) with the log's JSON in
the `AIGeneratedJSON` column. That row has no `ProgrammeId`, so the dashboard's
submission reads skip it. So no second list or extra env var is needed — as
long as `SHAREPOINT_SITE_ID` + that customer's submissions-list var (below)
are set, the log persists. (There is no dedicated-list option any more — an
earlier draft of this doc described one via `SP_LIST_CEOLOG`, but the code
doesn't read that variable at all.)

> With no SharePoint configured, the log falls back to
> `data/ceo-log-<customerId>.json` on local disk. Fine for `next dev`, but
> **will not persist on SWA** (read-only filesystem) — SharePoint must be
> configured for any real deployment.

### 2. Configure environment variables in SWA

In the SWA resource → **Environment variables** (under *Settings*), add every
key below with real values. This is the **only** place secrets need to live —
see "Known rough edges" above for why build-time duplication isn't needed.

| Key | Notes |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude narratives |
| `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` | live board data at check-in |
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID` | Entra sign-in — the **one** app registration that gates the whole platform (launchpad, Pulse, and now the Invoice Dashboard too) |
| `SHAREPOINT_SITE_ID` | the SharePoint site every customer's list lives on |
| `SP_LIST_SUBMISSIONS` | Evora's submissions list id |
| `SP_LIST_SUBMISSIONS_GMR` | GMR's submissions list id — leave unset until GMR is a real (non-"coming soon") customer; the pulse page short-circuits to a "coming soon" screen before ever reading this |
| `AUTH_SECRET` | session cookie signing (`npx auth secret`) |
| `AUTH_URL` | **the deployed https URL**, e.g. `https://<app>.azurestaticapps.net` (no trailing slash) |
| `ALLOWED_EMAILS` | optional app-level allowlist, comma-separated, applies to every customer and to the Invoice Dashboard alike |

These are encrypted at rest and free — no separate billing, and no Key Vault
needed (Key Vault reference support on SWA requires managed identity, which
itself requires the Standard plan, so it isn't an option on Free anyway).
Anyone with Contributor/Owner on this specific Azure resource can read the raw
values in the Portal, though — scope access accordingly.

**Invoice Dashboard note:** it reads its workbook via the same session token
as everything else (delegated scope `Sites.ReadWrite.All`, already requested
in `auth.ts`). If, after deploying, the invoice screen shows a 403 from Graph
where Pulse works fine, add `Files.Read.All` (delegated) to this same Entra
app → API permissions → grant admin consent, then sign out/in.

### 3. Update the Entra app redirect URI

Add `https://<your-swa-host>/api/auth/callback/microsoft-entra-id` to the
Entra app registration's redirect URIs, alongside the localhost one. Only this
**one** app registration needs updating — the Invoice Dashboard's old,
now-unused Entra app registration doesn't need any redirect URI and can be
left alone or deleted at your convenience.

### 4. Build settings

When you connect the repo in the SWA portal (or via the generated GitHub
Action), use:

- **Build preset:** Next.js
- **App location:** `/`
- **Api location:** *(empty)* — API routes are part of the Next.js app
- **Output location:** *(empty)*

The generated workflow uses `Azure/static-web-apps-deploy@v1` and detects
Next.js automatically:

```yaml
- uses: Azure/static-web-apps-deploy@v1
  with:
    azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
    app_location: "/"
    api_location: ""
    output_location: ""
```

The build itself runs `next build && node scripts/copy-standalone-assets.mjs`
(see `package.json`) — the copy step puts `.next/static` and `public/`
(including the committed `public/invoice/`) alongside the standalone server,
which Microsoft's docs require for hybrid Next.js on SWA.

## Cost safety on the Free plan

The Free plan is a hard $0 — Microsoft's own docs confirm that exceeding the
100 GB/month bandwidth quota **stops serving the site**, it does not bill
overage (only Standard bills overage). The only ways to end up with an Azure
bill from this project are: switching the plan to Standard, adding Key Vault,
adding Application Insights, provisioning a linked Azure Functions/App
Service/Container Apps backend, or buying a custom domain from a registrar.
None of those are needed for this app.

## Caveats to know before you commit to SWA

Hybrid Next.js support is in public preview and has
[documented limitations](https://learn.microsoft.com/azure/static-web-apps/deploy-nextjs-hybrid)
(app size ceiling, some unsupported `staticwebapp.config.json` properties,
cold starts on the managed backend). This project stays within the supported
surface (App Router SSR, Route Handlers, middleware, standalone output). If
you hit a wall, the same code — because it holds **zero local state** — also
runs unchanged on **Azure App Service** or **Azure Container Apps**
(`next build` + `next start` against the standalone server). Keep that as the
fallback if hybrid preview proves too rough.
