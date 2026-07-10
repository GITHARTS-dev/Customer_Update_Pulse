# Deploying to Azure Static Web Apps

This app is built to run on Azure Static Web Apps (SWA) **Free plan**. The one
rule SWA imposes that shaped the architecture: **the filesystem is read-only at
runtime** — nothing can be written to disk. That is why *all* persistent state
lives in SharePoint lists via Microsoft Graph, not in local JSON files.

## What makes it eligible

- **No runtime disk writes.** Submissions and the CEO log both persist to
  SharePoint. Local `next dev` can still fall back to a JSON file for the CEO
  log (see `SP_LIST_CEOLOG` below), but production never touches disk.
- **Hybrid Next.js, not static export.** There is no `output: "export"` — the
  app uses server components, API routes (`runtime = "nodejs"`), middleware,
  and per-request auth. SWA's **hybrid Next.js support** (currently in
  **public preview** at Microsoft) runs this on a managed backend automatically
  included on every plan, including Free.
- **Do NOT set `output: "standalone"`.** SWA's hybrid Next.js build produces
  the standard `.next` output and wires the server to its own managed backend,
  tracing only the runtime dependencies itself (so the ~397 MB `node_modules`
  is never uploaded wholesale — the 250 MB app cap applies to the static
  assets, which are small). Setting `output: "standalone"` makes `next build`
  emit a self-contained server SWA does **not** run, so no SSR handler serves
  requests and every dynamic route (including `/`) returns **404** even though
  the deploy "succeeds". This bit us once — leave it off.
- **One deploy workflow only.** Azure generates
  `.github/workflows/azure-static-web-apps-<name>.yml` with the resource's
  deployment-token secret. Keep exactly that one — a second workflow firing on
  the same `push` races and clobbers the first.
- **Middleware excludes `/.swa/*`.** SWA validates a deployment by requesting
  `/.swa/health.html`. Our middleware gates every route behind sign-in, so
  without this exclusion the health check gets redirected to `/sign-in` and
  Azure reports the deployment as failed. See `middleware.ts`'s `matcher`.
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
   was the build-time-only mistake above, not a platform bug — App Settings →
   process env has been core, well-tested Azure App Service plumbing for
   years, and hybrid Next.js's managed backend runs on that same plumbing.
   Still: **treat the first post-deploy check-in as a real test**, not a
   formality. If a run fails, the app's own error messages name the exact
   missing variable (e.g. `"SharePoint is not configured (SHAREPOINT_SITE_ID)"`)
   — read `docs/azure-swa.md` deploy checklist below, or the Log stream, before
   assuming anything is wrong with the app itself.

## One-time setup

### 1. Where the CEO log lives (usually nothing to do)

The CEO log (decision touches, "viewed" marks, notes to leads) needs a home
that isn't the disk. **By default it lives inside the existing submissions
list** — one extra sentinel row (Title `__ceo_log__`) with the log's JSON in
the `AIGeneratedJSON` column. That row has no `ProgrammeId`, so the dashboard's
submission reads skip it. So **no second list is required** for SWA — as long
as `SHAREPOINT_SITE_ID` + `SP_LIST_SUBMISSIONS` are set, the log persists.

Optional: if you'd rather keep the submissions list clean, create a dedicated
list and point `SP_LIST_CEOLOG` at it:

1. Site contents → **New → List** → name it e.g. `Pulse CEO Log`.
2. Add one column: **Data**, type **Multiple lines of text**, **Plain text**
   (not enhanced rich text).
3. Get the list's Graph id (`GET /sites/{siteId}/lists?$select=id,name`) and
   set it as `SP_LIST_CEOLOG`.

> With no SharePoint configured at all, the log falls back to
> `data/ceo-log.json`. That is fine for local `next dev` but **will not persist
> on SWA** — so SharePoint must be configured for any real deployment.

### 2. Configure environment variables in SWA

In the SWA resource → **Environment variables** (under *Settings*), add every
key from `.env.example` with real values. This is the **only** place secrets
need to live for this app — see "Known rough edges" above for why build-time
duplication isn't needed here.

| Key | Notes |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude narratives |
| `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` | live board data at check-in |
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID` | Entra sign-in (public/PKCE client) |
| `SHAREPOINT_SITE_ID`, `SP_LIST_SUBMISSIONS`, `SP_LIST_CEOLOG` | data stores |
| `AUTH_SECRET` | session cookie signing (`npx auth secret`) |
| `AUTH_URL` | **the deployed https URL**, e.g. `https://<app>.azurestaticapps.net` |
| `ALLOWED_EMAILS` | optional app-level allowlist |

These are encrypted at rest and free — no separate billing, and no Key Vault
needed (Key Vault reference support on SWA requires managed identity, which
itself requires the Standard plan, so it isn't an option on Free anyway).
Anyone with Contributor/Owner on this specific Azure resource can read the raw
values in the Portal, though — scope access accordingly.

### 3. Update the Entra app redirect URI

Add `https://<your-swa-host>/api/auth/callback/microsoft-entra-id` to the
Entra app registration's redirect URIs, alongside the localhost one.

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

## Cost safety on the Free plan

The Free plan is a hard $0 — Microsoft's own docs confirm that exceeding the
100 GB/month bandwidth quota **stops serving the site**, it does not bill
overage (only Standard bills overage). The only ways to end up with an Azure
bill from this project are: switching the plan to Standard, adding Key Vault,
adding Application Insights, provisioning a linked Azure Functions/App
Service/Container Apps backend, or buying a custom domain from a registrar.
None of those are needed for this app — see the deployment walkthrough for the
exact settings that keep everything on Free.

## Caveats to know before you commit to SWA

Hybrid Next.js support is in public preview and has
[documented limitations](https://learn.microsoft.com/azure/static-web-apps/deploy-nextjs-hybrid)
(app size ceiling, some unsupported `staticwebapp.config.json` properties,
cold starts on the managed backend). This project stays within the supported
surface (App Router SSR, Route Handlers, middleware, standalone output). If
you hit a wall, the same code — because it holds **zero local state** — also
runs unchanged on **Azure App Service** or **Azure Container Apps**
(`next build` + `next start`, no standalone/copy-script needed there). Keep
that as the fallback if hybrid preview proves too rough.
