# Harts Customer Invoice Dashboard

React dashboard for the EVORA monthly invoice workbook, deployed to
**Azure Static Web Apps (Free tier)** with **Entra ID** sign-in. Invoice data is
read live from SharePoint by a managed Azure Function via Microsoft Graph - the
browser bundle never contains the workbook or any Graph credential.

---

## Architecture

```
Browser ── Entra sign-in ──▶ Azure Static Web Apps (Free)
                                │
                                ├── static React build  (no data, no secrets)
                                │
                                └── /api/invoices  (managed Azure Function)
                                          │
                                          ├── decodes x-ms-client-principal,
                                          │   rejects anyone outside ALLOWED_USERS
                                          │
                                          └── Microsoft Graph (client credentials)
                                                  │
                                                  └── one specific SharePoint
                                                      site only (Sites.Selected)
```

Two Entra app registrations are involved:

| App | Used by | Purpose | Permissions |
|---|---|---|---|
| **SWA Auth app** | Static Web Apps | Signs users in via OIDC | None (sign-in only) |
| **Graph reader app** | The Function | Reads the SharePoint workbook | `Sites.Selected` (Application), granted `read` on the **one** site only |

Both live in tenant `7c51239d-08e0-4f24-92b0-68ca7dccba54`.

---

## One-time Azure setup

### 1. Create the SWA Auth app registration

In Entra > App registrations > New registration:

- Name: `harts-invoice-dashboard-auth`
- Supported account types: **Single tenant**
- Redirect URI (Web): `https://<your-swa-host>.azurestaticapps.net/.auth/login/aad/callback`

Then:

- Certificates & secrets → New client secret → copy the value (you'll paste it as `AAD_CLIENT_SECRET` on the SWA).
- API permissions: leave the default `User.Read` (Delegated). No admin consent needed.
- **Enterprise applications → this app → Properties:** set **Assignment required = Yes**.
- **Enterprise applications → this app → Users and groups:** assign the ~5 users
  (or one security group) that are allowed to sign in. Nobody else in the tenant
  can authenticate to the app.

### 2. Create the Graph reader app registration

In Entra > App registrations > New registration:

- Name: `harts-invoice-dashboard-graph`
- Single tenant. No redirect URI.

Then:

- Certificates & secrets → New client secret → copy the value (this becomes
  `GRAPH_CLIENT_SECRET` on the Function).
- API permissions → Add a permission → Microsoft Graph → **Application
  permissions** → add **`Sites.Selected`** (read-only). Do **not** add
  `Sites.Read.All` or `Files.Read.All`.
- Click **Grant admin consent** (tenant admin required).

### 3. Grant the Graph reader access to the ONE site

`Sites.Selected` grants no site access by itself - you must explicitly grant the
app principal access to the single SharePoint site that holds the workbook.

Run this once (PowerShell, signed-in as a SharePoint admin via Graph
PowerShell, or via Graph Explorer with `Sites.FullControl.All` delegated):

```http
PUT https://graph.microsoft.com/v1.0/sites/{site-id}/permissions
Content-Type: application/json

{
  "roles": ["read"],
  "grantedToIdentities": [
    {
      "application": {
        "id": "<graph-app-client-id>",
        "displayName": "harts-invoice-dashboard-graph"
      }
    }
  ]
}
```

Get `{site-id}` from:
```http
GET https://graph.microsoft.com/v1.0/sites/gobalharts.sharepoint.com:/sites/HARTSFellowship-2025
```

### 4. Configure SWA app settings

In the Azure Portal → your Static Web App → Configuration → Application
settings, set:

| Name | Value |
|---|---|
| `AAD_CLIENT_ID` | client ID of the SWA Auth app |
| `AAD_CLIENT_SECRET` | secret you copied in step 1 |
| `GRAPH_TENANT_ID` | `7c51239d-08e0-4f24-92b0-68ca7dccba54` |
| `GRAPH_CLIENT_ID` | client ID of the Graph reader app |
| `GRAPH_CLIENT_SECRET` | secret you copied in step 2 |
| `SHAREPOINT_SHARE_URL` | the share link to the workbook (see `api/local.settings.json.example`) |
| `ALLOWED_USERS` | comma-separated UPNs allowed to call `/api/*` (defence in depth on top of step 1) |

Currently `ALLOWED_USERS = naresh.kumar@globalharts.com`. Append more emails as
the user list grows. **The SWA Auth app's user assignment list (step 1) is the
authoritative gate; `ALLOWED_USERS` is a second check inside the Function.**

---

## Local development

The Static Web Apps CLI emulates both the auth wrapper and the managed
Function, so `/api` and `x-ms-client-principal` work locally.

```bash
# one time
npm install
npm install --prefix api
npm install -g @azure/static-web-apps-cli

# create local secrets (NOT committed)
cp api/local.settings.json.example api/local.settings.json
# then edit api/local.settings.json with the Graph client id/secret
```

Run:

```bash
# terminal 1: Vite dev server
npm run dev
# terminal 2: SWA emulator (proxies Vite + spins up /api + fake auth)
swa start http://localhost:5173 --api-location api
```

Open <http://localhost:4280>. Sign in via the dev login at
<http://localhost:4280/.auth/login/aad> - set `userDetails` to your UPN so the
allowlist check passes.

`api/local.settings.json` is gitignored. Never commit it.

---

## Security guarantees (verify before each release)

- The React bundle contains **zero** secrets and **zero** invoice data.
- The client only ever talks to `/api/invoices` - never to Microsoft Graph
  directly, and it never sees the Graph access token.
- The Graph reader app has `Sites.Selected` (read-only), granted on **one**
  site. It cannot enumerate the tenant or read any other site/library.
- The SWA Auth app has **Assignment required = Yes**; only assigned users can
  even start sign-in.
- The Function rejects any caller whose `x-ms-client-principal.userDetails` is
  not in `ALLOWED_USERS`, even if SWA somehow lets them through.
- `local.settings.json`, `.env`, and `*.xlsx` are gitignored.

If the access policy ever changes so that not all users may see all rows (e.g.
hiding Harts Pay from some users), filtering **must** be done in the Function
before the JSON is returned - never by hiding columns in React.

---

## Workbook layout (Function expects this)

Sheets `Jan26 … Jun26` on the workbook at `SHAREPOINT_SHARE_URL`, with each
sheet laid out as:

```
Row 1: <date> | Hours | Days | Daily Rate | Total | _ | HARTS Pay | Diff | Profit % | _
Then per person:
  - a name-only row in column A
  - one row per project with Hours / Rate / Total
  - on the first project row, columns F–I hold the person rollups
  (HARTS Pay column = G)
Then "Service Fee Total" row, "Expenses Total", "SUM", "Tax 19%", "Net Total".
```

If the sheet names or columns change, update `SHEETS` and `parseRows()` in
`api/invoices/index.js`.
