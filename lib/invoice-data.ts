import "server-only";

/**
 * Fetches and parses the Invoice Dashboard's monthly workbook. Moved server-side
 * (out of the browser) for two reasons: it lets every read for one load share a
 * single Graph "workbook session" instead of each of the 8 sheet reads forcing
 * Graph to re-open and re-parse the whole Excel file from scratch (the dominant
 * cost — this is Microsoft's own documented Excel-on-Graph performance trap),
 * and it lets the parsed result be cached across users/requests, since this is
 * shared data that changes at most monthly.
 */

const GRAPH = "https://graph.microsoft.com/v1.0";
const REQUEST_TIMEOUT_MS = 20000;
const MAX_ATTEMPTS = 3;

const SHAREPOINT_SHARE_URL =
  "https://gobalharts.sharepoint.com/:x:/r/sites/HARTSFellowship-2025-FinanceandInvoice/Freigegebene%20Dokumente/Customer%20Invoice/EVORA/EVORA%20Invoice%20Template1.xlsx?d=we7455f3dcae245828ccf6db449e19888&csf=1&web=1&e=0sJ4JY";

// `key` must be unique across every sheet/year (it's the identifier used for month
// selection everywhere) — keep it equal to `sheet` so adding a past year (e.g. Jan25)
// never collides with the same month abbreviation in another year (e.g. Jan26).
const MONTHLY_SHEETS = [
  { key: "Jan25", sheet: "Jan25", label: "January 2025", shortLabel: "Jan 2025" },
  { key: "Feb25", sheet: "Feb25", label: "February 2025", shortLabel: "Feb 2025" },
  { key: "Mar25", sheet: "Mar25", label: "March 2025", shortLabel: "Mar 2025" },
  { key: "Apr25", sheet: "Apr25", label: "April 2025", shortLabel: "Apr 2025" },
  { key: "May25", sheet: "May25", label: "May 2025", shortLabel: "May 2025" },
  { key: "Jun25", sheet: "Jun25", label: "June 2025", shortLabel: "Jun 2025" },
  { key: "Jul25", sheet: "Jul25", label: "July 2025", shortLabel: "Jul 2025" },
  { key: "Aug25", sheet: "Aug25", label: "August 2025", shortLabel: "Aug 2025" },
  { key: "Sep25", sheet: "Sep25", label: "September 2025", shortLabel: "Sep 2025" },
  { key: "Oct25", sheet: "Oct25", label: "October 2025", shortLabel: "Oct 2025" },
  { key: "Nov25", sheet: "Nov25", label: "November 2025", shortLabel: "Nov 2025" },
  { key: "Dec25", sheet: "Dec25", label: "December 2025", shortLabel: "Dec 2025" },
  { key: "Jan26", sheet: "Jan26", label: "January 2026", shortLabel: "Jan 2026" },
  { key: "Feb26", sheet: "Feb26", label: "February 2026", shortLabel: "Feb 2026" },
  { key: "Mar26", sheet: "Mar26", label: "March 2026", shortLabel: "Mar 2026" },
  { key: "Apr26", sheet: "Apr26", label: "April 2026", shortLabel: "Apr 2026" },
  { key: "May26", sheet: "May26", label: "May 2026", shortLabel: "May 2026" },
  { key: "Jun26", sheet: "Jun26", label: "June 2026", shortLabel: "Jun 2026" }
];

function num(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(/[€₹,\s]/g, ""));
  return isFinite(n) ? n : 0;
}

function formatPersonName(name: unknown): string {
  const raw = String(name ?? "").trim();
  if (!raw) return "";
  if (!raw.includes(".") || raw.includes(" ")) return raw;
  return raw
    .split(".")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}

const isExcludedProject = (name: unknown) => String(name ?? "").trim().toLowerCase() === "travel";

interface BillingProject {
  name: string;
  hours: number;
  days: number;
  dailyRate: number;
  revenue: number;
}

interface BillingPerson {
  name: string;
  projects: BillingProject[];
  hours: number;
  days: number;
  revenue: number;
  level?: string | null;
}

interface ParsedMonth {
  month: string;
  billing: BillingPerson[];
  totalRevenue: number;
}

function parseRows(rows: unknown[][], monthLabel: string): ParsedMonth | null {
  if (!rows || !rows.length) return null;
  const billing: BillingPerson[] = [];
  let current: BillingPerson | null = null;
  let totalRevenue = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const a = String(r[0] ?? "").trim();
    const cLabel = String(r[2] ?? "").toLowerCase();
    if (cLabel.includes("total") || cLabel === "sum") {
      if (cLabel.includes("service fee")) {
        totalRevenue = num(r[4]);
        break;
      }
      continue;
    }
    if (!a) continue;
    const hours = num(r[1]),
      rate = num(r[3]),
      total = num(r[4]);
    if (!hours && !rate && !total) {
      current = { name: formatPersonName(a), projects: [], hours: 0, days: 0, revenue: 0 };
      billing.push(current);
      continue;
    }
    if (!current) continue;
    const days = num(r[2]) || (hours ? hours / 8 : 0);
    if (isExcludedProject(a)) continue;
    current.projects.push({ name: a || "Unspecified", hours, days, dailyRate: rate, revenue: total });
  }
  billing.forEach((p) => {
    p.hours = p.projects.reduce((s, x) => s + x.hours, 0);
    p.days = p.projects.reduce((s, x) => s + x.days, 0);
    p.revenue = p.projects.reduce((s, x) => s + x.revenue, 0);
  });
  return { month: monthLabel, billing, totalRevenue };
}

function parseLevels(rows: unknown[][]): Record<string, string> {
  const map: Record<string, string> = {};
  for (let i = 1; i < rows.length; i++) {
    const name = formatPersonName(String((rows[i] as unknown[])?.[0] ?? "").trim());
    const level = String((rows[i] as unknown[])?.[1] ?? "").trim();
    if (name && level) map[name] = level;
  }
  return map;
}

function parseCaps(rows: unknown[][]): Record<number, number> {
  const map: Record<number, number> = {};
  for (let i = 1; i < rows.length; i++) {
    const year = parseInt(String((rows[i] as unknown[])?.[0] ?? "").trim());
    const cap = num((rows[i] as unknown[])?.[1]);
    if (year >= 2020 && year <= 2050 && cap > 0) map[year] = cap;
  }
  return map;
}

function encodeShareUrl(url: string): string {
  return "u!" + Buffer.from(url, "utf-8").toString("base64").replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
}

async function graphFetchRaw(
  url: string,
  token: string,
  sessionId?: string,
  init?: RequestInit
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        ...init,
        method: init?.method ?? "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(sessionId ? { "workbook-session-id": sessionId } : {}),
          ...(init?.headers ?? {})
        },
        cache: "no-store",
        signal: controller.signal
      });
      clearTimeout(timer);
      if ((res.status >= 500 || res.status === 429) && attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 300));
        continue;
      }
      return res;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 300));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

async function fetchWorksheetValues(
  base: string,
  sheetName: string,
  token: string,
  sessionId: string
): Promise<unknown[][] | null> {
  const res = await graphFetchRaw(
    `${base}/workbook/worksheets('${encodeURIComponent(sheetName)}')/usedRange(valuesOnly=true)?$select=values`,
    token,
    sessionId
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`sheet "${sheetName}" ${res.status} - ${body.slice(0, 200) || res.statusText}`);
  }
  const { values } = (await res.json()) as { values?: unknown[][] };
  return values ?? [];
}

export interface InvoiceMonth {
  key: string;
  sheet: string;
  label: string;
  shortLabel: string;
  data: ParsedMonth;
}

export interface InvoiceData {
  months: InvoiceMonth[];
  capsMap: Record<number, number>;
}

async function fetchInvoiceData(token: string): Promise<InvoiceData> {
  const itemRes = await graphFetchRaw(
    `${GRAPH}/shares/${encodeShareUrl(SHAREPOINT_SHARE_URL)}/driveItem?$select=id,parentReference`,
    token
  );
  if (!itemRes.ok) {
    const body = await itemRes.text().catch(() => "");
    throw new Error(`share resolve ${itemRes.status} - ${body.slice(0, 200) || itemRes.statusText}`);
  }
  const item = (await itemRes.json()) as { id: string; parentReference: { driveId: string } };
  const driveId = item.parentReference.driveId;
  const itemId = item.id;
  const base = `${GRAPH}/drives/${driveId}/items/${itemId}`;

  // A shared session is the key fix: without it, each of the 8 reads below
  // makes Graph open + parse the entire workbook independently.
  const sessionRes = await graphFetchRaw(`${base}/workbook/createSession`, token, undefined, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ persistChanges: false })
  });
  if (!sessionRes.ok) {
    const body = await sessionRes.text().catch(() => "");
    throw new Error(`createSession ${sessionRes.status} - ${body.slice(0, 200)}`);
  }
  const { id: sessionId } = (await sessionRes.json()) as { id: string };

  try {
    // All 8 reads run concurrently under the one session — wall-clock is
    // bounded by the slowest single read, not their sum.
    const [levelValues, capsValues, ...sheetResults] = await Promise.all([
      fetchWorksheetValues(base, "Levels", token, sessionId),
      fetchWorksheetValues(base, "Caps", token, sessionId),
      ...MONTHLY_SHEETS.map((spec) => fetchWorksheetValues(base, spec.sheet, token, sessionId))
    ]);

    const levelMap = parseLevels(levelValues ?? []);
    const capsMap = parseCaps(capsValues ?? []);

    const months: InvoiceMonth[] = [];
    MONTHLY_SHEETS.forEach((spec, i) => {
      const values = sheetResults[i];
      if (values == null) return; // sheet absent (404) — same as the old behaviour
      const parsed = parseRows(values, spec.label);
      if (parsed) {
        parsed.billing.forEach((p) => {
          p.level = levelMap[p.name] ?? null;
        });
        months.push({ ...spec, data: parsed });
      }
    });

    return { months, capsMap };
  } finally {
    // Best-effort cleanup — an already-expired session shouldn't fail the request.
    graphFetchRaw(`${base}/workbook/closeSession`, token, sessionId, { method: "POST" }).catch(() => {});
  }
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: { data: InvoiceData; expiresAt: number } | null = null;

/**
 * This is shared data (the same workbook for every viewer), so the parsed
 * result is cached process-wide rather than per-user: the first request in
 * each 5-minute window pays the Graph cost, everyone else gets it instantly.
 * Only a successful fetch is cached — a failure never poisons the cache.
 * `force` bypasses the TTL for an explicit user-triggered refresh.
 */
export async function loadInvoiceData(accessToken: string, force = false): Promise<InvoiceData> {
  if (!force && cached && cached.expiresAt > Date.now()) return cached.data;
  const data = await fetchInvoiceData(accessToken);
  cached = { data, expiresAt: Date.now() + CACHE_TTL_MS };
  return data;
}
