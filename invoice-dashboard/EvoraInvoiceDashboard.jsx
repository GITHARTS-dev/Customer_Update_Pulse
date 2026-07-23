import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Cell, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, AreaChart, Area,
  Line, LineChart, LabelList,
  PieChart, Pie,
  ComposedChart, ReferenceLine,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from "recharts";
import { AlertTriangle, RefreshCw, Lock } from "lucide-react";

const hartsLogoUrl = new URL("./logos/harts.png", import.meta.url).href;

const evoraLogoUrl = new URL("./logos/Evora New Logo only.png", import.meta.url).href;

const CUSTOMERS = [
  { key: "evora", label: "Evora", logo: evoraLogoUrl },
];

const isExcludedProject = (name) => String(name ?? "").trim().toLowerCase() === "travel";

const LINE_PALETTE = [
  "#2563eb", "#10b981", "#f59e0b", "#7c3aed", "#0891b2",
  "#f97316", "#dc2626", "#16a34a", "#db2777", "#4f46e5",
  "#0d9488", "#65a30d", "#9333ea", "#e11d48", "#0284c7", "#6d28d9",
];

// Sequential single-hue palettes for ranked/ordinal bar charts (darkest = highest value)
const SEQ_BLUE  = ["#1e3a8a","#1e40af","#1d4ed8","#2563eb","#3b82f6","#60a5fa","#93c5fd","#bfdbfe"];
const SEQ_AMBER = ["#78350f","#92400e","#b45309","#d97706","#f59e0b","#fbbf24","#fde68a","#fef3c7"];
const SEQ_CYAN  = ["#164e63","#155e75","#0e7490","#0891b2","#06b6d4","#22d3ee","#67e8f9","#a5f3fc"];

function seqColors(n, palette) {
  if (n <= 0) return [];
  if (n === 1) return [palette[0]];
  return Array.from({ length: n }, (_, i) => {
    const idx = Math.round(i * (palette.length - 1) / (n - 1));
    return palette[idx];
  });
}

/* ---------- helpers ---------- */

const fmtEUR = (n) => {
  if (n == null || !isFinite(n)) return "€0";
  const a = Math.abs(Math.round(n));
  const sign = n < 0 ? "-" : "";
  if (a >= 1000000) return `${sign}€${(a / 1000000).toFixed(2)}M`;
  if (a >= 1000)    return `${sign}€${(a / 1000).toFixed(1)}K`;
  return `${sign}€${a}`;
};

const fmtEURRate = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function aggregateMonth(data) {
  const revenue = data.totalRevenue || 0;
  const billingHours = data.billing.reduce((s, p) => s + (p.hours || 0), 0);
  const activePeople = data.billing.filter((p) => p.revenue > 0).length;
  const avgRate = billingHours > 0 ? revenue / billingHours : 0;
  return { revenue, billingHours, activePeople, avgRate };
}

function buildTrendRows(monthsList, capsMap) {
  return monthsList.map((mm) => {
    const agg = aggregateMonth(mm.data);
    const year = parseInt(mm.shortLabel.match(/\d{4}/)?.[0]);
    const annualCap = capsMap[year] ?? null;
    const monthlyPace = annualCap ? annualCap / 12 : null;
    return {
      key: mm.key,
      label: mm.shortLabel,
      revenue: agg.revenue,
      billingHours: agg.billingHours,
      activePeople: agg.activePeople,
      avgRate: agg.avgRate,
      annualCap,
      monthlyPace,
      realizationPct: monthlyPace ? (agg.revenue / monthlyPace) * 100 : null,
    };
  });
}

function buildYearAgg(trendRows) {
  const n = trendRows.length;
  const s = trendRows.reduce((a, r) => ({
    revenue: a.revenue + r.revenue,
    billingHours: a.billingHours + r.billingHours,
  }), { revenue: 0, billingHours: 0 });
  const annualCap        = trendRows[n - 1]?.annualCap ?? null;
  const monthlyAvg       = n > 0 ? s.revenue / n : 0;
  const projectedYE      = monthlyAvg * 12;
  const expectedYTD      = annualCap ? (annualCap / 12) * n : null;
  const realizationRate  = expectedYTD ? (s.revenue / expectedYTD) * 100 : null;
  const capProgress      = annualCap ? (s.revenue / annualCap) * 100 : null;
  return {
    ...s,
    avgRate: s.billingHours > 0 ? s.revenue / s.billingHours : 0,
    months: n,
    annualCap,
    monthlyAvg,
    projectedYE,
    realizationRate,
    capProgress,
    expectedYTD,
  };
}

function buildRevenueChartMax(trendRows) {
  const maxRev  = trendRows.reduce((m, t) => Math.max(m, t.revenue), 0);
  const maxPace = trendRows.reduce((m, t) => Math.max(m, t.monthlyPace ?? 0), 0);
  const raw = Math.max(maxRev, maxPace) * 1.18;
  return Math.ceil(raw / 1000) * 1000;
}

// `extract(data)` returns [{ name, value }] for one month.
function buildEntitySeries(months, extract) {
  const totals = new Map();
  const rows = months.map((m) => {
    const row = { month: m.shortLabel };
    const entries = extract(m.data) || [];
    entries.forEach(({ name, value }) => {
      if (!name) return;
      const v = Number(value) || 0;
      row[name] = (row[name] || 0) + v;
      totals.set(name, (totals.get(name) || 0) + v);
    });
    return row;
  });
  const entities = [...totals.entries()]
    .map(([name, total]) => ({ name, total }))
    .filter((e) => e.total !== 0)
    .sort((a, b) => b.total - a.total);
  rows.forEach((r) => entities.forEach((e) => { if (r[e.name] == null) r[e.name] = 0; }));
  return { rows, entities };
}

/* ---------- small UI pieces ---------- */

const Kpi = ({ label, value, valueSuffix, tone = "blue", delta, invertGood = false, breakdown, onClick }) => {
  const PAL = {
    blue:   { stripe: "#2563eb", bg: "bg-blue-50",    ring: "ring-blue-200",    labelCls: "text-blue-600",    valColor: "#1e40af" },
    red:    { stripe: "#dc2626", bg: "bg-rose-50",    ring: "ring-rose-200",    labelCls: "text-rose-600",    valColor: "#991b1b" },
    amber:  { stripe: "#f59e0b", bg: "bg-amber-50",   ring: "ring-amber-200",   labelCls: "text-amber-700",   valColor: "#92400e" },
    green:  { stripe: "#10b981", bg: "bg-emerald-50", ring: "ring-emerald-200", labelCls: "text-emerald-700", valColor: "#065f46" },
    violet: { stripe: "#7c3aed", bg: "bg-violet-50",  ring: "ring-violet-200",  labelCls: "text-violet-600",  valColor: "#4c1d95" },
    cyan:   { stripe: "#0ea5e9", bg: "bg-cyan-50",    ring: "ring-cyan-200",    labelCls: "text-cyan-600",    valColor: "#0c4a6e" },
  };
  const p = PAL[tone] || PAL.blue;

  let deltaUI = null;
  if (delta && Number.isFinite(delta.value)) {
    const isUp = delta.value > 0;
    const isFlat = delta.value === 0;
    const favourable = isFlat ? null : invertGood ? !isUp : isUp;
    const arrow = isFlat ? "■" : isUp ? "▲" : "▼";
    const cls = isFlat ? "text-slate-500" : favourable ? "text-emerald-600" : "text-rose-500";
    deltaUI = (
      <div className={`mt-2 flex items-center gap-1 text-xs font-medium ${cls}`}>
        <span className="text-sm leading-none">{arrow}</span>
        <span>{delta.text} <span className="text-[10px] font-normal opacity-70">{delta.label || "vs previous month"}</span></span>
      </div>
    );
  }

  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`group overflow-hidden rounded-2xl ${p.bg} shadow-sm ring-1 ${p.ring} transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-xl flex flex-col text-left ${onClick ? "cursor-pointer focus:outline-none focus:ring-2 focus:ring-violet-300" : ""}`}
    >
      <div className="h-1.5 w-full transition-all duration-300 group-hover:h-2" style={{ background: p.stripe }} />
      <div className="px-5 py-4 flex-1">
        <div className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${p.labelCls}`}>{label}</div>
        <div className="mt-2 flex items-start justify-between gap-2">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold transition-transform duration-300 group-hover:scale-105 group-hover:[transform-origin:left_center]" style={{ color: p.valColor }}>{value}</span>
            {valueSuffix && <span className="text-sm font-medium" style={{ color: p.stripe }}>{valueSuffix}</span>}
          </div>
          {breakdown && breakdown.length > 0 && (
            <div className="space-y-0.5 text-right shrink-0">
              {breakdown.map(({ label: bLabel, value: bValue }) => (
                <div key={bLabel} className="text-[11px]" style={{ color: p.stripe }}>
                  <span>{bLabel} </span>
                  <span className="font-semibold">{bValue}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {deltaUI}
      </div>
    </Tag>
  );
};

function ScrollableChart({ numPoints, pxPerPoint = 68, height = 360, threshold = 12, children }) {
  const scroll = numPoints > threshold;
  return (
    <div style={{ overflowX: scroll ? "auto" : "visible", width: "100%", WebkitOverflowScrolling: "touch" }}>
      <div style={{ width: scroll ? numPoints * pxPerPoint : "100%", height }}>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function LevelLegend() {
  const items = [
    { label: "Senior", color: LEVEL_COLORS.Senior },
    { label: "Mid", color: LEVEL_COLORS.Mid },
    { label: "Junior", color: LEVEL_COLORS.Junior },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
      {items.map((item) => (
        <div key={item.label} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
          <span className="font-medium">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function MultiLineChart({ title, subtitle, accent = "#2563eb", series, valueFormatter, pageSize = 5, page: externalPage, onPageChange }) {
  const [internalPage, setInternalPage] = React.useState(0);
  const isControlled = externalPage !== undefined;
  const page = isControlled ? externalPage : internalPage;
  const setPage = isControlled ? onPageChange : setInternalPage;
  const [focusedLine, setFocusedLine] = React.useState(null);
  const [tableOpen, setTableOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [sortKey, setSortKey] = React.useState(null);
  const [sortDir, setSortDir] = React.useState("desc");

  const PAGE_SIZE = pageSize;
  const totalPages = Math.max(1, Math.ceil(series.entities.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const visible = series.entities.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const openTable = () => { setSearch(""); setSortKey(null); setSortDir("desc"); setTableOpen(true); };

  const tableRows = React.useMemo(() => {
    return series.entities.map((e, i) => {
      const vals = series.rows.map((r) => r[e.name] ?? 0);
      const nonZero = vals.filter((v) => v > 0);
      let slope = 0;
      if (nonZero.length >= 2) {
        const n = nonZero.length;
        const xMean = (n - 1) / 2;
        const yMean = nonZero.reduce((s, v) => s + v, 0) / n;
        const num = nonZero.reduce((s, v, xi) => s + (xi - xMean) * (v - yMean), 0);
        const den = nonZero.reduce((s, _, xi) => s + (xi - xMean) ** 2, 0);
        slope = den === 0 ? 0 : num / den;
      }
      const threshold = Math.max(...vals, 1) * 0.03;
      const trend = slope > threshold ? "up" : slope < -threshold ? "down" : "flat";
      const latest = vals[vals.length - 1] ?? 0;
      return { name: e.name, vals, latest, trend, color: LINE_PALETTE[i % LINE_PALETTE.length] };
    });
  }, [series]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortIcon = (key) => {
    if (sortKey !== key) return <span className="ml-0.5 text-slate-300 text-[10px]">⇅</span>;
    return sortDir === "asc"
      ? <span className="ml-0.5 text-slate-700 text-[10px]">↑</span>
      : <span className="ml-0.5 text-slate-700 text-[10px]">↓</span>;
  };

  const filteredSorted = React.useMemo(() => {
    let rows = tableRows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));
    rows = rows.slice().sort((a, b) => {
      if (sortKey === "name") {
        return sortDir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      if (sortKey === "trend") {
        const order = { up: 2, flat: 1, down: 0 };
        const diff = order[a.trend] - order[b.trend];
        return sortDir === "asc" ? diff : -diff;
      }
      let va, vb;
      if (sortKey === null) {
        va = a.latest; vb = b.latest;
      } else {
        const ri = series.rows.findIndex((r) => r.month === sortKey);
        va = ri >= 0 ? (a.vals[ri] ?? 0) : 0;
        vb = ri >= 0 ? (b.vals[ri] ?? 0) : 0;
      }
      return sortDir === "asc" ? va - vb : vb - va;
    });
    return rows;
  }, [tableRows, search, sortKey, sortDir, series.rows]);

  const btnCls = (active) =>
    `rounded-md px-3 py-1 font-medium transition ${active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`;

  const thCls = "px-3 py-2.5 text-right font-semibold text-slate-500 whitespace-nowrap cursor-pointer select-none hover:text-slate-800 hover:bg-slate-100";

  return (
    <>
      <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <span className="mt-1 h-5 w-1 rounded-full" style={{ background: accent }} />
            <div>
              <h2 className="text-base font-semibold">{title}</h2>
              {subtitle && <div className="text-[11px] text-slate-500">{subtitle}</div>}
            </div>
          </div>
          <div className="inline-flex items-center rounded-lg bg-slate-100 p-0.5 text-xs gap-0.5">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="rounded-md px-2 py-1 font-medium text-slate-500 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >← Prev</button>
            <span className="px-2 py-1 text-slate-500 whitespace-nowrap">
              {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, series.entities.length)} of {series.entities.length}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={safePage >= totalPages - 1}
              className="rounded-md px-2 py-1 font-medium text-slate-500 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >Next →</button>
            <button onClick={openTable} className={btnCls(false)}>Table</button>
          </div>
        </div>

        <div className="mt-2 text-[11px] text-slate-400">Hover a name in the legend to highlight · click chart to open full table</div>
        <div className="mt-3">
          <ScrollableChart numPoints={series.rows.length} height={360}>
            <LineChart data={series.rows} margin={{ left: 8, right: 36, top: 8, bottom: 4 }} onClick={openTable} style={{ cursor: "pointer" }}>
              <CartesianGrid stroke="#eef2f7" strokeDasharray="2 3" />
              <XAxis dataKey="month" interval={0} tick={{ fontSize: 11, fill: "#475569" }} axisLine={false} tickLine={false} padding={{ right: 12 }} />
              <YAxis tickFormatter={valueFormatter} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={64} />
              <Tooltip
                allowEscapeViewBox={{ x: false, y: false }}
                position={{ y: 8 }}
                wrapperStyle={{ zIndex: 50, pointerEvents: "auto" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const sorted = [...payload].filter((p) => (p.value ?? 0) > 0).sort((a, b) => b.value - a.value);
                  if (!sorted.length) return null;
                  return (
                    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.08)", fontSize: 12, minWidth: 210, maxWidth: 270 }}>
                      <div style={{ padding: "7px 12px", fontWeight: 700, color: "#0f172a", borderBottom: "1px solid #f1f5f9" }}>{label}</div>
                      <div style={{ maxHeight: 220, overflowY: "auto", padding: "6px 0 6px" }}>
                        {sorted.map((p) => (
                          <div key={p.dataKey} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, padding: "2px 12px", color: p.color }}>
                            <span style={{ color: p.color }}>{p.name}</span>
                            <span style={{ fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap" }}>{valueFormatter(p.value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                iconType="circle"
                onMouseEnter={(e) => setFocusedLine(e.dataKey)}
                onMouseLeave={() => setFocusedLine(null)}
              />
              {visible.map((e, i) => {
                const color = LINE_PALETTE[i % LINE_PALETTE.length];
                const dimmed = focusedLine !== null && focusedLine !== e.name;
                return (
                  <Line
                    key={e.name}
                    type="monotone"
                    dataKey={e.name}
                    stroke={color}
                    strokeWidth={focusedLine === e.name ? 3.5 : 2.2}
                    strokeOpacity={dimmed ? 0.1 : 1}
                    dot={dimmed ? false : { r: 3, fill: color, strokeWidth: 0 }}
                    activeDot={dimmed ? false : { r: 5 }}
                    isAnimationActive={false}
                  />
                );
              })}
            </LineChart>
          </ScrollableChart>
        </div>
      </div>

      {tableOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          style={{ backdropFilter: "blur(2px)" }}
          onClick={() => setTableOpen(false)}
        >
          <div
            className="relative flex max-h-[82vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-start gap-2">
                <span className="mt-1 h-5 w-1 rounded-full" style={{ background: accent }} />
                <div>
                  <h2 className="text-base font-semibold">{title}</h2>
                  {subtitle && <div className="text-[11px] text-slate-500">{subtitle}</div>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-44 rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200"
                  autoFocus
                />
                <button
                  onClick={() => setTableOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr>
                    <th className="py-2.5 pl-5 pr-2 text-left font-semibold text-slate-500">#</th>
                    <th
                      className="cursor-pointer select-none py-2.5 pr-4 text-left font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                      onClick={() => handleSort("name")}
                    >
                      Name {sortIcon("name")}
                    </th>
                    {series.rows.map((r) => (
                      <th key={r.month} className={thCls} onClick={() => handleSort(r.month)}>
                        {r.month} {sortIcon(r.month)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredSorted.length === 0 ? (
                    <tr>
                      <td colSpan={series.rows.length + 2} className="py-10 text-center text-sm text-slate-400">
                        No results for &ldquo;{search}&rdquo;
                      </td>
                    </tr>
                  ) : (
                    filteredSorted.map((row, idx) => (
                      <tr key={row.name} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="py-2.5 pl-5 pr-2 text-slate-400">{idx + 1}</td>
                        <td className="py-2.5 pr-4 font-semibold" style={{ color: row.color }}>{row.name}</td>
                        {series.rows.map((r) => (
                          <td key={r.month} className="px-3 py-2.5 text-right text-slate-600 whitespace-nowrap">
                            {(r[row.name] ?? 0) !== 0
                              ? <span style={{ color: (r[row.name] ?? 0) < 0 ? "#f43f5e" : undefined }}>{valueFormatter(r[row.name])}</span>
                              : <span className="text-slate-300">-</span>}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-slate-100 px-6 py-2 text-[11px] text-slate-400">
              {filteredSorted.length} of {tableRows.length} entries
              Click column headers to sort
            </div>
          </div>
        </div>
      )}
    </>
  );
}


const TrendTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload;
  const gap = row.monthlyPace != null ? row.revenue - row.monthlyPace : null;
  const isOver = gap !== null && gap >= 0;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs shadow-md" style={{ minWidth: 196 }}>
      <div className="font-semibold text-slate-900 mb-2">{label}</div>
      <div className="flex justify-between gap-8 text-slate-500">
        <span>Revenue</span>
        <span className="font-semibold text-slate-800">{fmtEUR(row.revenue)}</span>
      </div>
      {row.monthlyPace != null && (
        <div className="flex justify-between gap-8 text-slate-500">
          <span>Monthly pace</span>
          <span className="font-semibold text-slate-800">{fmtEUR(row.monthlyPace)}</span>
        </div>
      )}
      {gap !== null && (
        <div className={`flex justify-between gap-8 mt-1.5 pt-1.5 border-t border-slate-100 font-semibold ${isOver ? "text-rose-600" : "text-amber-600"}`}>
          <span>{isOver ? "▲ Overage" : "▼ Shortfall"}</span>
          <span>{isOver ? "+" : ""}{fmtEUR(gap)}</span>
        </div>
      )}
      <div className="flex justify-between gap-8 text-slate-500 mt-1">
        <span>Hours billed</span>
        <span className="font-semibold text-slate-800">{Math.round(row.billingHours || 0)}h</span>
      </div>
    </div>
  );
};

function ChartLegendSwatch({ color, dashed, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
      <svg width="16" height="8" viewBox="0 0 16 8" aria-hidden="true">
        <line
          x1="0" y1="4" x2="16" y2="4"
          stroke={color} strokeWidth="2.5" strokeLinecap="round"
          strokeDasharray={dashed ? "4 3" : undefined}
        />
      </svg>
      {label}
    </span>
  );
}

function RevenueTrendChart({ trend, revenueChartMax }) {
  if (!trend.length) return null;
  const hasCap = trend.some((t) => t.monthlyPace);
  return (
    <div className="mt-4 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Monthly Revenue</div>
          <h2 className="text-base font-semibold">Revenue per month</h2>
        </div>
        <div className="flex items-center gap-4 pt-0.5">
          <ChartLegendSwatch color="#2563eb" label="Revenue" />
          {hasCap && <ChartLegendSwatch color="#f59e0b" dashed label="Ceiling pace (annual ceiling ÷ 12)" />}
        </div>
      </div>
      <ScrollableChart numPoints={trend.length} pxPerPoint={104} height={370}>
        <AreaChart data={trend} margin={{ left: 10, right: 96, top: 24, bottom: 30 }}>
          <defs>
            <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#2563eb" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#eef2f7" strokeDasharray="2 3" />
          <XAxis
            dataKey="label"
            interval={0}
            tick={{ fontSize: 11, fill: "#475569" }}
            axisLine={false}
            tickLine={false}
            height={42}
            dy={10}
            padding={{ left: 18, right: 18 }}
          />
          <YAxis tickFormatter={fmtEUR} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={72} domain={[0, revenueChartMax]} tickCount={7} />
          <Tooltip content={<TrendTooltip />} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
          {(() => {
            const pace = trend.filter((t) => t.monthlyPace).at(-1)?.monthlyPace;
            return pace ? (
              <ReferenceLine y={pace} stroke="#f59e0b" strokeDasharray="7 4" strokeWidth={2}
                label={{ value: `Ceiling/12 · ${fmtEUR(pace)}`, position: "insideTopRight", offset: 10, fontSize: 10, fill: "#b45309", fontWeight: 600 }}
              />
            ) : null;
          })()}
          <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#2563eb" strokeWidth={2.5}
            fill="url(#revFill)" dot={{ r: 4, fill: "#2563eb", strokeWidth: 0 }} activeDot={{ r: 6 }}
          />
        </AreaChart>
      </ScrollableChart>
    </div>
  );
}

/* ---------- view chrome ---------- */

const VIEWS = [
  { key: "overview", label: "Overview" },
  { key: "monthly",  label: "Month View" },
];

function ViewTabs({ active, onChange }) {
  return (
    <div className="inline-flex rounded-xl bg-slate-100 p-1 text-sm">
      {VIEWS.map((v) => (
        <button
          key={v.key}
          onClick={() => onChange(v.key)}
          className={`rounded-lg px-4 py-1.5 font-medium transition ${
            active === v.key
              ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

const ALL_MONTH_ABBRS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function YearPicker({ years, value, onChange, label = "Year", accent = "#4f46e5" }) {
  const [open, setOpen] = React.useState(false);
  if (!years.length) return null;
  const sortedYears = [...years].sort((a, b) => b - a);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 text-sm">
        <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ background: accent }} />
        <span className="text-slate-500">{label}</span>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 shadow-sm hover:border-slate-300 focus:outline-none flex items-center gap-2"
        >
          {value ?? sortedYears[0]}
          <span className="text-slate-400 text-[10px]">▾</span>
        </button>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full mt-1.5 z-50 rounded-xl bg-white shadow-2xl ring-1 ring-slate-200 p-1.5"
            style={{ minWidth: 112 }}
            onClick={(e) => e.stopPropagation()}
          >
            {sortedYears.map((year) => (
              <button
                key={year}
                onClick={() => { onChange(year); setOpen(false); }}
                className={`w-full rounded-lg px-3 py-1.5 text-left text-sm font-medium transition ${
                  year === value ? "bg-indigo-50 text-indigo-700" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {year}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MonthPicker({ months, value, onChange, label, accent = "#2563eb", minValue, maxValue }) {
  const [open, setOpen] = React.useState(false);

  const byYear = React.useMemo(() => {
    const map = new Map();
    months.forEach((m) => {
      const yr = parseInt(m.shortLabel.match(/\d{4}/)?.[0]);
      if (!yr) return;
      if (!map.has(yr)) map.set(yr, new Map());
      map.get(yr).set(m.shortLabel.split(" ")[0], m);
    });
    return map;
  }, [months]);

  const years = React.useMemo(() => [...byYear.keys()].sort((a, b) => a - b), [byYear]);

  const yearOfValue = () => {
    const m = months.find((m) => m.key === value);
    return m ? parseInt(m.shortLabel.match(/\d{4}/)?.[0]) : (years[years.length - 1] ?? new Date().getFullYear());
  };

  const [viewYear, setViewYear] = React.useState(yearOfValue);

  const handleOpen = () => {
    setViewYear(yearOfValue());
    setOpen((v) => !v);
  };

  const selectedMonth = months.find((m) => m.key === value);
  const displayLabel = selectedMonth ? selectedMonth.shortLabel : "Select";

  const monthsInYear = byYear.get(viewYear) || new Map();

  return (
    <div className="relative">
      <div className="flex items-center gap-2 text-sm">
        <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ background: accent }} />
        <span className="text-slate-500">{label}</span>
        <button
          onClick={handleOpen}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 shadow-sm hover:border-slate-300 focus:outline-none flex items-center gap-2"
        >
          {displayLabel}
          <span className="text-slate-400 text-[10px]">▾</span>
        </button>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full mt-1.5 z-50 rounded-xl bg-white shadow-2xl ring-1 ring-slate-200 p-3"
            style={{ minWidth: 210 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Year navigation */}
            <div className="flex items-center justify-between mb-2 px-1">
              <button
                onClick={() => setViewYear((y) => y - 1)}
                disabled={!years.includes(viewYear - 1)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-25 disabled:cursor-not-allowed transition text-sm"
              >←</button>
              <span className="text-sm font-semibold text-slate-800">{viewYear}</span>
              <button
                onClick={() => setViewYear((y) => y + 1)}
                disabled={!years.includes(viewYear + 1)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-25 disabled:cursor-not-allowed transition text-sm"
              >→</button>
            </div>

            {/* Month grid - 3 columns */}
            {(() => {
              const minIdx = minValue != null ? months.findIndex((m) => m.key === minValue) : -1;
              const maxIdx = maxValue != null ? months.findIndex((m) => m.key === maxValue) : -1;
              return (
                <div className="grid grid-cols-3 gap-1">
                  {ALL_MONTH_ABBRS.map((abbr) => {
                    const entry = monthsInYear.get(abbr);
                    const entryIdx = entry ? months.findIndex((m) => m.key === entry.key) : -1;
                    const outOfRange = entry && (
                      (minIdx >= 0 && entryIdx < minIdx) ||
                      (maxIdx >= 0 && entryIdx > maxIdx)
                    );
                    const disabled = !entry || outOfRange;
                    const isSelected = !!entry && entry.key === value;
                    return (
                      <button
                        key={abbr}
                        disabled={disabled}
                        onClick={() => { if (!disabled) { onChange(entry.key); setOpen(false); } }}
                        className={`rounded-lg py-1.5 text-xs font-medium transition
                          ${isSelected ? "text-white shadow-sm" : ""}
                          ${!disabled && !isSelected ? "text-slate-700 hover:bg-slate-100" : ""}
                          ${disabled ? "text-slate-300 cursor-not-allowed" : ""}
                        `}
                        style={isSelected ? { background: accent } : {}}
                      >
                        {abbr}
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </>
      )}
    </div>
  );
}

function MonthRangePicker({ months, fromKey, toKey, onFromChange, onToChange }) {
  const [open, setOpen] = React.useState(false);
  const [pendingFrom, setPendingFrom] = React.useState(null);
  const [hoverKey, setHoverKey] = React.useState(null);

  const byYear = React.useMemo(() => {
    const map = new Map();
    months.forEach((m) => {
      const yr = parseInt(m.shortLabel.match(/\d{4}/)?.[0]);
      if (!yr) return;
      if (!map.has(yr)) map.set(yr, new Map());
      map.get(yr).set(m.shortLabel.split(" ")[0], m);
    });
    return map;
  }, [months]);

  const years = React.useMemo(() => [...byYear.keys()].sort((a, b) => a - b), [byYear]);
  const getIdx = (key) => months.findIndex((m) => m.key === key);

  const getYearOfKey = (key) => {
    const m = months.find((m) => m.key === key);
    return m ? parseInt(m.shortLabel.match(/\d{4}/)?.[0]) : (years[years.length - 1] ?? new Date().getFullYear());
  };

  const [viewYear, setViewYear] = React.useState(() => getYearOfKey(fromKey));

  const handleOpen = () => {
    setViewYear(getYearOfKey(fromKey));
    setPendingFrom(null);
    setHoverKey(null);
    setOpen(true);
  };

  const handleClose = () => {
    setPendingFrom(null);
    setHoverKey(null);
    setOpen(false);
  };

  const handleMonthClick = (key) => {
    if (!pendingFrom) {
      setPendingFrom(key);
    } else {
      const pi = getIdx(pendingFrom), ci = getIdx(key);
      onFromChange(pi <= ci ? pendingFrom : key);
      onToChange(pi <= ci ? key : pendingFrom);
      handleClose();
    }
  };

  // effective preview range (min/max of pendingFrom + hover, or committed range)
  const previewFrom = (() => {
    if (!pendingFrom) return fromKey;
    if (!hoverKey) return pendingFrom;
    return getIdx(pendingFrom) <= getIdx(hoverKey) ? pendingFrom : hoverKey;
  })();
  const previewTo = (() => {
    if (!pendingFrom) return toKey;
    if (!hoverKey) return pendingFrom;
    return getIdx(pendingFrom) <= getIdx(hoverKey) ? hoverKey : pendingFrom;
  })();

  const previewFromIdx = getIdx(previewFrom);
  const previewToIdx = getIdx(previewTo);

  const fmtKey = (key) => {
    const m = months.find((m) => m.key === key);
    return m ? m.shortLabel : "-";
  };

  const monthsInYear = byYear.get(viewYear) || new Map();

  return (
    <div className="relative">
      <button
        onClick={handleOpen}
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 shadow-sm hover:border-slate-300 focus:outline-none"
      >
        <span>{fmtKey(fromKey)}</span>
        <span className="text-slate-400 text-xs">-</span>
        <span>{fmtKey(toKey)}</span>
        <span className="text-slate-400 text-[10px] ml-1">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={handleClose} />
          <div
            className="absolute left-0 top-full mt-1.5 z-50 rounded-xl bg-white shadow-2xl ring-1 ring-slate-200 p-4"
            style={{ minWidth: 230 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Year nav */}
            <div className="flex items-center justify-between mb-1 px-1">
              <button
                onClick={() => setViewYear((y) => y - 1)}
                disabled={!years.includes(viewYear - 1)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-25 disabled:cursor-not-allowed transition text-sm"
              >←</button>
              <span className="text-sm font-semibold text-slate-800">{viewYear}</span>
              <button
                onClick={() => setViewYear((y) => y + 1)}
                disabled={!years.includes(viewYear + 1)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-25 disabled:cursor-not-allowed transition text-sm"
              >→</button>
            </div>

            <div className="mb-3 text-center text-[10px] text-slate-400">
              {pendingFrom ? "Now click the end month" : "Click the start month"}
            </div>

            {/* Month grid */}
            <div className="grid grid-cols-3 gap-1">
              {ALL_MONTH_ABBRS.map((abbr) => {
                const entry = monthsInYear.get(abbr);
                const isAvailable = !!entry;
                const entryIdx = entry ? getIdx(entry.key) : -1;
                const isStart = isAvailable && entry.key === previewFrom;
                const isEnd = isAvailable && entry.key === previewTo && previewTo !== previewFrom;
                const inRange = isAvailable && !isStart && !isEnd && entryIdx > previewFromIdx && entryIdx < previewToIdx;

                let cls = "rounded-lg py-1.5 text-xs font-medium transition ";
                let sty = {};
                if (!isAvailable) {
                  cls += "text-slate-300 cursor-not-allowed";
                } else if (isStart || isEnd) {
                  cls += "text-white shadow-sm cursor-pointer";
                  sty = { background: "#4f46e5" };
                } else if (inRange) {
                  cls += "bg-indigo-50 text-indigo-700 cursor-pointer";
                } else {
                  cls += "text-slate-700 hover:bg-slate-100 cursor-pointer";
                }

                return (
                  <button
                    key={abbr}
                    disabled={!isAvailable}
                    onClick={() => isAvailable && handleMonthClick(entry.key)}
                    onMouseEnter={() => { if (pendingFrom && isAvailable) setHoverKey(entry.key); }}
                    onMouseLeave={() => { if (pendingFrom) setHoverKey(null); }}
                    className={cls}
                    style={sty}
                  >
                    {abbr}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- single month view ---------- */


const StackedProjectTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  const items = payload.filter((p) => (p.value || 0) > 0).sort((a, b) => b.value - a.value);
  if (!items.length) return null;
  const total = items.reduce((s, p) => s + p.value, 0);
  const visible = items.slice(0, 8);
  const hidden = items.length - visible.length;
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-lg text-xs" style={{ minWidth: 200, maxWidth: 260 }}>
      <div className="px-3 py-2 font-semibold text-slate-900 border-b border-slate-100">{label}</div>
      <div className="px-3 py-2 space-y-1.5">
        {visible.map((p) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.fill }} />
              <span className="truncate text-slate-600">{p.dataKey}</span>
            </div>
            <span className="font-medium text-slate-800 shrink-0">{fmtEUR(p.value)}</span>
          </div>
        ))}
        {hidden > 0 && (
          <div className="text-slate-400 pt-0.5">+{hidden} more projects</div>
        )}
      </div>
      <div className="px-3 py-2 border-t border-slate-100 flex justify-between font-semibold text-slate-900">
        <span>Total</span><span>{fmtEUR(total)}</span>
      </div>
    </div>
  );
};


function ProjectPopup({ person, onClose, accentFrom, accentTo, accentText, accentBg, donutMetric, defaultSortKey, compareMap }) {
  const [sortKey, setSortKey] = React.useState(defaultSortKey);
  const [sortDir, setSortDir] = React.useState("desc");

  const baseRows = (person.projects || [])
    .filter((x) => (x[donutMetric] || 0) > 0)
    .sort((a, b) => (b[defaultSortKey] || 0) - (a[defaultSortKey] || 0));

  const hasCompare = !!compareMap && baseRows.some((x) => compareMap.has(x.name));

  const colorMap = new Map(baseRows.map((x, i) => [x.name, LINE_PALETTE[i % LINE_PALETTE.length]]));

  const sorted = React.useMemo(() => {
    const rows = [...baseRows];
    rows.sort((a, b) => {
      if (sortKey === "name") return sortDir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      if (sortKey === "deltaHours") {
        const aPrev = hasCompare ? (compareMap.get(a.name)?.hours || 0) : 0;
        const bPrev = hasCompare ? (compareMap.get(b.name)?.hours || 0) : 0;
        const aDelta = (a.hours || 0) - aPrev;
        const bDelta = (b.hours || 0) - bPrev;
        return sortDir === "asc" ? aDelta - bDelta : bDelta - aDelta;
      }
      const va = a[sortKey] || 0, vb = b[sortKey] || 0;
      return sortDir === "asc" ? va - vb : vb - va;
    });
    return rows;
  }, [baseRows, sortKey, sortDir]);

  const totalHours = baseRows.reduce((s, x) => s + (x.hours || 0), 0);
  const totalRevenue = baseRows.reduce((s, x) => s + (x.revenue || 0), 0);
  const totalDeltaHours = hasCompare
    ? baseRows.reduce((s, x) => s + ((x.hours || 0) - (compareMap.get(x.name)?.hours || 0)), 0)
    : null;
  const donutData = baseRows.map((x) => ({ name: x.name, value: x[donutMetric] || 0, fill: colorMap.get(x.name) }));
  const isHoursDonut = donutMetric === "hours";

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const sortIcon = (key) => {
    if (sortKey !== key) return <span className="ml-0.5 opacity-30">⇅</span>;
    return <span className="ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const thLeft = `pb-2 text-left text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap transition-colors hover:text-slate-700 ${sortKey === "name" ? "text-slate-700" : "text-slate-400"}`;
  const thRight = (key) => `pb-2 text-right text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap transition-colors hover:text-slate-700 ${sortKey === key ? "text-slate-700" : "text-slate-400"}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" style={{ backdropFilter: "blur(2px)" }} onClick={onClose}>
      <div className="rounded-2xl bg-white shadow-2xl overflow-hidden" style={{ width: 540, maxWidth: "95vw" }} onClick={(e) => e.stopPropagation()}>
        <div className={`h-1 w-full bg-gradient-to-r ${accentFrom} ${accentTo}`} />
        <div className={`flex items-center justify-between gap-4 px-5 py-3 border-b border-slate-100 bg-gradient-to-r ${accentBg} to-white`}>
          <div>
            <div className={`text-[10px] font-semibold uppercase tracking-widest ${accentText}`}>Project Breakdown</div>
            <div className="text-sm font-bold text-slate-900">{person.name}</div>
            <div className="text-[11px] text-slate-500">{baseRows.length} project{baseRows.length !== 1 ? "s" : ""}</div>
          </div>
          <button onClick={onClose} className={`flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:${accentBg} ${accentText} text-lg leading-none shrink-0`}>×</button>
        </div>
        <div className="flex items-start gap-5 p-5">
          <div className="relative shrink-0" style={{ width: 180, height: 180 }}>
            <PieChart width={180} height={180}>
              <Pie data={donutData} cx={90} cy={90} innerRadius={52} outerRadius={82} dataKey="value"
                paddingAngle={donutData.length > 1 ? 2 : 0} isAnimationActive={false} strokeWidth={0}>
                {donutData.map((d) => <Cell key={d.name} fill={d.fill} />)}
              </Pie>
              <Tooltip
                formatter={(v, n) => [isHoursDonut ? `${Number(v).toFixed(1)}h` : fmtEUR(v), n]}
                contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 11, background: "#fff" }}
                wrapperStyle={{ zIndex: 50 }}
              />
            </PieChart>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-base font-bold text-slate-800">{isHoursDonut ? `${totalHours.toFixed(1)}h` : fmtEUR(totalRevenue)}</div>
              <div className="text-[10px] text-slate-400">{isHoursDonut ? "total hours" : "total revenue"}</div>
            </div>
            <div className="absolute -bottom-9 left-1/2 w-max -translate-x-1/2">
              <LevelLegend />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <table className="w-full text-xs border-collapse" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col />
                <col style={{ width: 52 }} />
                <col style={{ width: 68 }} />
                {hasCompare && <col style={{ width: 76 }} />}
              </colgroup>
              <thead>
                <tr className="border-b border-slate-100">
                  <th className={thLeft}>
                    <button type="button" onClick={() => handleSort("name")} className="flex h-full w-full items-center gap-1 whitespace-nowrap leading-none text-left">
                      <span>Project</span>{sortIcon("name")}
                    </button>
                  </th>
                  <th className={thRight("hours")}>
                    <button type="button" onClick={() => handleSort("hours")} className="flex h-full w-full items-center justify-end gap-1 whitespace-nowrap leading-none text-right">
                      <span>Hours</span>{sortIcon("hours")}
                    </button>
                  </th>
                  <th className={thRight("revenue")}>
                    <button type="button" onClick={() => handleSort("revenue")} className="flex h-full w-full items-center justify-end gap-1 whitespace-nowrap leading-none text-right">
                      <span>Revenue</span>{sortIcon("revenue")}
                    </button>
                  </th>
                  {hasCompare && <th className={thRight("deltaHours")}>
                    <button type="button" onClick={() => handleSort("deltaHours")} className="flex h-full w-full items-center justify-end gap-1 whitespace-nowrap leading-none text-right">
                      <span>Δ Hours</span>{sortIcon("deltaHours")}
                    </button>
                  </th>}
                </tr>
              </thead>
              <tbody>
                {sorted.map((x) => {
                  const prevHours = hasCompare ? (compareMap.get(x.name)?.hours || 0) : null;
                  const hoursDelta = prevHours != null ? (x.hours || 0) - prevHours : null;
                  return (
                    <tr key={x.name} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2 pr-3">
                        <div className="flex items-start gap-1.5">
                          <span className="mt-0.5 h-2 w-2 rounded-full shrink-0" style={{ background: colorMap.get(x.name) }} />
                          <span className="font-medium text-slate-700 leading-snug">{x.name}</span>
                        </div>
                      </td>
                      <td className="py-2 text-right font-medium text-blue-600 align-top">{x.hours ? `${parseFloat(x.hours.toFixed(1))}h` : "-"}</td>
                      <td className="py-2 text-right font-medium text-emerald-600 align-top">{x.revenue ? fmtEUR(x.revenue) : "-"}</td>
                      {hasCompare && (
                        <td className={`py-2 text-right font-semibold align-top ${hoursDelta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          {hoursDelta >= 0 ? "▲" : "▼"}{Math.abs(hoursDelta).toFixed(1)}h
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200">
                  <td className="pt-2 font-bold text-slate-800">Total</td>
                  <td className="pt-2 text-right font-bold text-blue-700">{totalHours ? `${parseFloat(totalHours.toFixed(1))}h` : "-"}</td>
                  <td className="pt-2 text-right font-bold text-emerald-700">{fmtEUR(totalRevenue)}</td>
                  {hasCompare && <td className={`pt-2 text-right font-bold ${totalDeltaHours >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{totalDeltaHours >= 0 ? "▲" : "▼"}{Math.abs(totalDeltaHours).toFixed(1)}h</td>}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActivePeoplePopup({ people, onClose }) {
  const [sortKey, setSortKey] = React.useState("level");
  const [sortDir, setSortDir] = React.useState("asc");

  const rows = React.useMemo(() => {
    return [...people]
      .map((person) => {
        const level = person.level || "Other";
        const dailyRate = person.projects?.find((x) => (x.dailyRate || 0) > 0)?.dailyRate
          ?? (person.hours > 0 ? (person.revenue / person.hours) * 8 : 0);
        return {
          name: person.name,
          level,
          dailyRate,
          hourlyRate: dailyRate > 0 ? dailyRate / 8 : 0,
          levelColor: LEVEL_COLORS[level] || LEVEL_COLORS.Other,
        };
      })
      .sort((a, b) => {
        const aLevel = LEVEL_ORDER.indexOf(a.level);
        const bLevel = LEVEL_ORDER.indexOf(b.level);
        if (sortKey === "name") return sortDir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        if (sortKey === "level") return sortDir === "asc" ? aLevel - bLevel : bLevel - aLevel;
        if (sortKey === "dailyRate") return sortDir === "asc" ? a.dailyRate - b.dailyRate : b.dailyRate - a.dailyRate;
        if (sortKey === "hourlyRate") return sortDir === "asc" ? a.hourlyRate - b.hourlyRate : b.hourlyRate - a.hourlyRate;
        return 0;
      });
  }, [people, sortDir, sortKey]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "level" ? "asc" : "desc");
    }
  };

  const sortIcon = (key) => {
    if (sortKey !== key) return <span className="ml-0.5 opacity-30">⇅</span>;
    return <span className="ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" style={{ backdropFilter: "blur(2px)" }} onClick={onClose}>
      <div className="rounded-2xl bg-white shadow-2xl overflow-hidden" style={{ width: 540, maxWidth: "95vw" }} onClick={(e) => e.stopPropagation()}>
        <div className="h-1 w-full bg-gradient-to-r from-violet-400 to-fuchsia-500" />
        <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-violet-500">Active People</div>
            <div className="text-sm font-bold text-slate-900">Rate Card</div>
            <div className="text-[11px] text-slate-500">Daily rate shown for the selected month; hourly rate is daily rate divided by 8.</div>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-violet-100 hover:text-violet-700 text-lg leading-none shrink-0">×</button>
        </div>
        <div className="max-h-[72vh] overflow-auto">
          <table className="w-full border-collapse text-xs" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "38%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "21%" }} />
              <col style={{ width: "21%" }} />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="border-b border-slate-100">
                <th className={`px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap ${sortKey === "name" ? "text-slate-700" : "text-slate-400"}`} onClick={() => handleSort("name")}><span className="inline-flex items-center gap-1 whitespace-nowrap leading-none">People {sortIcon("name")}</span></th>
                <th className={`px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap ${sortKey === "level" ? "text-slate-700" : "text-slate-400"}`} onClick={() => handleSort("level")}><span className="inline-flex items-center gap-1 whitespace-nowrap leading-none">Level {sortIcon("level")}</span></th>
                <th className={`px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap ${sortKey === "dailyRate" ? "text-slate-700" : "text-slate-400"}`} onClick={() => handleSort("dailyRate")}><span className="inline-flex items-center justify-end gap-1 whitespace-nowrap leading-none">Daily Rate {sortIcon("dailyRate")}</span></th>
                <th className={`px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap ${sortKey === "hourlyRate" ? "text-slate-700" : "text-slate-400"}`} onClick={() => handleSort("hourlyRate")}><span className="inline-flex items-center justify-end gap-1 whitespace-nowrap leading-none">Hourly Rate {sortIcon("hourlyRate")}</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.name} className={`border-b border-slate-50 ${index % 2 === 0 ? "bg-white" : "bg-slate-50/40"}`}>
                  <td className="px-3 py-3 font-medium text-slate-800">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: row.levelColor }} />
                      <span className="truncate">{row.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-left whitespace-nowrap">
                    <span className="rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide" style={{ background: `${row.levelColor}1a`, color: row.levelColor }}>
                      {row.level}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-700 whitespace-nowrap">
                    {row.dailyRate > 0 ? fmtEURRate.format(row.dailyRate) : "-"}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-700 whitespace-nowrap">
                    {row.hourlyRate > 0 ? fmtEURRate.format(row.hourlyRate) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-100 px-5 py-2 text-[11px] text-slate-400">
          {rows.length} active people listed
        </div>
      </div>
    </div>
  );
}

function MonthlyView({ month, prevMonth, inCompare = false }) {
  if (!month) {
    return <div className="rounded-2xl bg-white p-6 text-sm text-slate-500 ring-1 ring-slate-200">No month selected.</div>;
  }
  const { data } = month;
  const agg = aggregateMonth(data);
  const prevAgg = prevMonth ? aggregateMonth(prevMonth.data) : null;
  const compareMonthLabel = prevMonth ? `vs ${prevMonth.shortLabel}` : "vs previous month";

  const people = data.billing
    .filter((p) => (p.revenue || 0) > 0)
    .map((p) => ({
      name: p.name,
      revenue: p.revenue || 0,
      hours: p.hours || 0,
      days: p.days || 0,
      projects: p.projects || [],
      level: p.level || "Other",
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const activePeopleRows = people;

  const earning = people;

  const allProjectNames = [...new Set(
    earning.flatMap((p) => p.projects.filter((x) => (x.revenue || 0) > 0).map((x) => x.name))
  )];

  const personProjectData = earning.map((p) => {
    const row = { name: p.name };
    allProjectNames.forEach((proj) => {
      const found = p.projects.find((x) => x.name === proj);
      row[proj] = found ? (found.revenue || 0) : 0;
    });
    return row;
  });

  const scatterData = [...earning]
    .sort((a, b) => {
      const ai = LEVEL_ORDER.indexOf(a.level || "Other");
      const bi = LEVEL_ORDER.indexOf(b.level || "Other");
      const ld = (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return ld !== 0 ? ld : b.revenue - a.revenue;
    })
    .map((p) => ({
      name: p.name,
      hours: Number((p.hours || 0).toFixed(1)),
      revenue: p.revenue,
      level: p.level || "Other",
      fill: LEVEL_COLORS[p.level] || LEVEL_COLORS["Other"],
    }));

  const projectMap = new Map();
  data.billing.forEach((p) => p.projects.forEach((x) => {
    if (isExcludedProject(x.name)) return;
    if (!projectMap.has(x.name)) projectMap.set(x.name, { name: x.name, revenue: 0, hours: 0 });
    const e = projectMap.get(x.name);
    e.revenue += x.revenue || 0;
    e.hours += x.hours || 0;
  }));
  const projects = [...projectMap.values()]
    .filter((p) => p.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);

  // Previous-month lookups, used to show inline hover deltas instead of a separate compare mode.
  const prevProjectRevMap = new Map();
  const prevProjectHoursMap = new Map();
  const prevHoursMap = new Map();
  const prevPersonProjectMap = new Map();
  if (prevMonth) {
    prevMonth.data.billing.forEach((p) => {
      prevHoursMap.set(p.name, (prevHoursMap.get(p.name) || 0) + (p.hours || 0));
      const projMap = new Map();
      (p.projects || []).forEach((x) => {
        if (isExcludedProject(x.name)) return;
        prevProjectRevMap.set(x.name, (prevProjectRevMap.get(x.name) || 0) + (x.revenue || 0));
        prevProjectHoursMap.set(x.name, (prevProjectHoursMap.get(x.name) || 0) + (x.hours || 0));
        projMap.set(x.name, { hours: x.hours || 0, revenue: x.revenue || 0 });
      });
      prevPersonProjectMap.set(p.name, projMap);
    });
  }

  const projectHoursMap = new Map(projects.map((p) => [p.name, p.hours || 0]));

  const [selectedPerson, setSelectedPerson] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [projectContributorSortKey, setProjectContributorSortKey] = useState("hours");
  const [projectContributorSortDir, setProjectContributorSortDir] = useState("desc");
  const [selectedUtilPerson, setSelectedUtilPerson] = useState(null);
  const [showAllProjects, setShowAllProjects] = useState(false);

  const barRowsHeight = Math.max(280, earning.length * 34);
  const visibleProjects = showAllProjects ? projects : projects.slice(0, 10);
  const projRowsHeight = Math.max(280, visibleProjects.length * 30 + 40);

  const handleProjectContributorSort = (key) => {
    if (projectContributorSortKey === key) setProjectContributorSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    else {
      setProjectContributorSortKey(key);
      setProjectContributorSortDir("desc");
    }
  };

  const projectContributorSortIcon = (key) => {
    if (projectContributorSortKey !== key) return <span className="ml-0.5 opacity-30">⇅</span>;
    return <span className="ml-0.5">{projectContributorSortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const projectContributorThLeft = `pb-2 text-left text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap transition-colors hover:text-slate-700 ${projectContributorSortKey === "name" ? "text-slate-700" : "text-slate-400"}`;
  const projectContributorThRight = (key) => `pb-2 text-right text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap transition-colors hover:text-slate-700 ${projectContributorSortKey === key ? "text-slate-700" : "text-slate-400"}`;

  const openProjectContributorPopup = (name) => {
    setProjectContributorSortKey("hours");
    setProjectContributorSortDir("desc");
    setSelectedProject(name);
  };

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className={`grid grid-cols-2 gap-3 ${inCompare ? "" : "sm:grid-cols-4"}`}>
        <Kpi label={`${month.shortLabel} · Revenue`} value={fmtEUR(agg.revenue)} tone="blue"
          delta={prevAgg && { value: agg.revenue - prevAgg.revenue, text: fmtEUR(Math.abs(agg.revenue - prevAgg.revenue)), label: compareMonthLabel }}
        />
        <Kpi label="Billable Hours" value={`${Math.round(agg.billingHours)}h`} tone="cyan"
          delta={prevAgg && { value: agg.billingHours - prevAgg.billingHours, text: `${Math.abs(Math.round(agg.billingHours - prevAgg.billingHours))}h`, label: compareMonthLabel }}
        />
        <Kpi label="Active People" value={`${agg.activePeople}`} tone="violet" onClick={() => setSelectedPerson(true)}
          delta={prevAgg && { value: agg.activePeople - prevAgg.activePeople, text: `${Math.abs(agg.activePeople - prevAgg.activePeople)}`, label: compareMonthLabel }}
        />
      </div>

      {/* Charts: side by side */}
      <div className={`grid gap-4 ${inCompare ? "grid-cols-1" : "lg:grid-cols-2"}`}>
        <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <span className="mt-1 h-5 w-1 rounded-full" style={{ background: "#f59e0b" }} />
              <div>
                <h2 className="text-base font-semibold">Projectwise Revenue</h2>
                <div className="text-[11px] text-slate-500">
                  {month.shortLabel} · showing {visibleProjects.length} of {projects.length} · click a bar to see contributors
                </div>
              </div>
            </div>
            {projects.length > 10 && (
              <button
                onClick={() => setShowAllProjects((v) => !v)}
                className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700 transition-colors"
              >
                {showAllProjects ? "Top 10" : `View all ${projects.length}`}
              </button>
            )}
          </div>
          <div className="mt-3" style={{ width: "100%", height: projRowsHeight }}>
            <ResponsiveContainer>
              <BarChart
                layout="vertical"
                data={visibleProjects}
                margin={{ left: 8, right: 64, top: 8, bottom: 4 }}
                style={{ cursor: "pointer" }}
                onClick={(e) => {
                  const name = e?.activePayload?.[0]?.payload?.name;
                  if (name) openProjectContributorPopup(name);
                }}
              >
                <CartesianGrid stroke="#eef2f7" strokeDasharray="2 3" horizontal={false} />
                <XAxis type="number" tickFormatter={fmtEUR} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#475569" }} axisLine={false} tickLine={false} width={130} />
                <Tooltip
                  cursor={{ fill: "rgba(0,0,0,0.04)" }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const revenue = payload[0].value;
                    const hours = projectHoursMap.get(label) ?? 0;
                    const prevRevenue = prevMonth ? (prevProjectRevMap.get(label) ?? 0) : null;
                    const prevHours = prevMonth ? (prevProjectHoursMap.get(label) ?? 0) : null;
                    const delta = prevRevenue != null ? revenue - prevRevenue : null;
                    const hoursDelta = prevHours != null ? hours - prevHours : null;
                    return (
                      <div style={{ borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", padding: "8px 12px", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)", minWidth: 210 }}>
                        <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>{label}</div>
                        <div style={{ color: "#475569", display: "flex", justifyContent: "space-between", gap: 16 }}>
                          <span>Revenue</span><span style={{ fontWeight: 600, color: "#0f172a" }}>{fmtEUR(revenue)}</span>
                        </div>
                        {delta != null && (
                          <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", gap: 16, fontWeight: 600, color: delta >= 0 ? "#059669" : "#e11d48" }}>
                            <span>{delta >= 0 ? "▲" : "▼"} {compareMonthLabel}</span>
                            <span>{delta >= 0 ? "+" : ""}{fmtEUR(delta)}</span>
                          </div>
                        )}
                        <div style={{ color: "#475569", display: "flex", justifyContent: "space-between", gap: 16 }}>
                          <span>Hours</span><span style={{ fontWeight: 600, color: "#0f172a" }}>{hours.toFixed(1)}h</span>
                        </div>
                        {hoursDelta != null && (
                          <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", gap: 16, fontWeight: 600, color: hoursDelta >= 0 ? "#059669" : "#e11d48" }}>
                            <span>{hoursDelta >= 0 ? "▲" : "▼"} {compareMonthLabel}</span>
                            <span>{hoursDelta >= 0 ? "+" : ""}{hoursDelta.toFixed(1)}h</span>
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
                <Bar dataKey="revenue" radius={[0, 6, 6, 0]}>
                  {seqColors(visibleProjects.length, SEQ_AMBER).map((c, i) => (
                    <Cell key={i} fill={c} />
                  ))}
                  <LabelList dataKey="revenue" position="right" formatter={fmtEUR} style={{ fontSize: 10, fill: "#64748b", fontWeight: 500 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <div className="flex items-start gap-2">
            <span className="mt-1 h-5 w-1 rounded-full" style={{ background: "#0ea5e9" }} />
            <div>
              <h2 className="text-base font-semibold">Billable Utilization</h2>
              <div className="text-[11px] text-slate-500">Hours billed per person · click bar for project breakdown</div>
            </div>
          </div>
          {(() => {
            const utilizationData = [...scatterData]
              .filter((d) => d.hours > 0)
              .sort((a, b) => {
                const ai = LEVEL_ORDER.indexOf(a.level || "Other");
                const bi = LEVEL_ORDER.indexOf(b.level || "Other");
                const ld = (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
                return ld !== 0 ? ld : b.hours - a.hours;
              });
            return (
              <div className="relative mt-3" style={{ width: "100%", height: 300 }}>
                <div className="absolute right-0 top-0 z-10">
                  <LevelLegend />
                </div>
                <ResponsiveContainer>
                  <BarChart
                    data={utilizationData}
                    margin={{ left: 8, right: 8, top: 24, bottom: 56 }}
                    style={{ cursor: "pointer" }}
                    onClick={(e) => {
                      const name = e?.activePayload?.[0]?.payload?.name;
                      if (name) setSelectedUtilPerson(name);
                    }}
                  >
                    <CartesianGrid stroke="#eef2f7" strokeDasharray="2 3" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: "#475569" }}
                      axisLine={false}
                      tickLine={false}
                      angle={-35}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: "rgba(0,0,0,0.04)" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        const prevHours = prevMonth ? (prevHoursMap.get(d.name) ?? 0) : null;
                        const delta = prevHours != null ? d.hours - prevHours : null;
                        return (
                          <div style={{ borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", padding: "8px 12px", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                            <div style={{ fontWeight: 700, color: d.fill, marginBottom: 4 }}>{d.name}</div>
                            <div style={{ color: "#475569" }}>Hours <span style={{ fontWeight: 600, color: "#0f172a", float: "right", marginLeft: 16 }}>{d.hours.toFixed(1)}h</span></div>
                            {delta != null && (
                              <div style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid #f1f5f9", fontWeight: 600, color: delta >= 0 ? "#059669" : "#e11d48" }}>
                                {delta >= 0 ? "▲" : "▼"} {compareMonthLabel} <span style={{ float: "right", marginLeft: 16 }}>{delta >= 0 ? "+" : ""}{delta.toFixed(1)}h</span>
                              </div>
                            )}
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="hours" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                      {utilizationData.map((d) => (
                        <Cell key={d.name} fill={LEVEL_COLORS[d.level] || LEVEL_COLORS["Other"]} />
                      ))}
                      <LabelList dataKey="hours" position="top" formatter={(v) => `${v}h`} style={{ fontSize: 10, fill: "#64748b", fontWeight: 500 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            );
          })()}
        </div>
      </div>

      {selectedPerson && (
        <ActivePeoplePopup
          people={activePeopleRows}
          onClose={() => setSelectedPerson(null)}
        />
      )}

      {selectedUtilPerson && (() => {
        const person = earning.find((p) => p.name === selectedUtilPerson);
        if (!person) return null;
        return (
          <ProjectPopup
            person={person}
            onClose={() => setSelectedUtilPerson(null)}
            accentFrom="from-sky-400" accentTo="to-cyan-400"
            accentText="text-sky-400" accentBg="from-sky-50"
            donutMetric="hours" defaultSortKey="hours"
            compareMap={prevMonth ? prevPersonProjectMap.get(person.name) : null}
          />
        );
      })()}

      {/* Project contributors popup */}
      {selectedProject && (() => {
        const projScatterData = earning
          .map((p, i) => {
            const px = p.projects.find((x) => x.name === selectedProject);
            if (!px || (px.revenue || 0) === 0) return null;
            return { name: p.name, hours: Number((px.hours || 0).toFixed(1)), revenue: px.revenue || 0, level: p.level || "Other", fill: LEVEL_COLORS[p.level] || LEVEL_COLORS["Other"] };
          })
          .filter(Boolean);
        const hasContribCompare = !!prevMonth && projScatterData.some((d) => prevPersonProjectMap.get(d.name)?.get(selectedProject));
        const seniorityHoursSort = (a, b, hoursDir = "desc") => {
          const ai = LEVEL_ORDER.indexOf(a.level || "Other");
          const bi = LEVEL_ORDER.indexOf(b.level || "Other");
          const levelDiff = (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
          if (levelDiff !== 0) return levelDiff;
          const hoursDiff = (a.hours || 0) - (b.hours || 0);
          if (hoursDiff !== 0) return hoursDir === "asc" ? hoursDiff : -hoursDiff;
          return a.name.localeCompare(b.name);
        };
        const donutProjScatterData = [...projScatterData].sort((a, b) => seniorityHoursSort(a, b, "desc"));
        const sortedProjScatterData = [...projScatterData].sort((a, b) => {
          if (projectContributorSortKey === "name") {
            return projectContributorSortDir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
          }
          if (projectContributorSortKey === "hours") {
            return seniorityHoursSort(a, b, projectContributorSortDir);
          }
          if (projectContributorSortKey === "deltaHours") {
            const aPrev = hasContribCompare ? (prevPersonProjectMap.get(a.name)?.get(selectedProject)?.hours || 0) : 0;
            const bPrev = hasContribCompare ? (prevPersonProjectMap.get(b.name)?.get(selectedProject)?.hours || 0) : 0;
            const aDelta = (a.hours || 0) - aPrev;
            const bDelta = (b.hours || 0) - bPrev;
            return projectContributorSortDir === "asc" ? aDelta - bDelta : bDelta - aDelta;
          }
          const av = a[projectContributorSortKey] || 0;
          const bv = b[projectContributorSortKey] || 0;
          return projectContributorSortDir === "asc" ? av - bv : bv - av;
        });
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            style={{ backdropFilter: "blur(3px)" }}
            onClick={() => setSelectedProject(null)}
          >
            <div
              className="rounded-2xl bg-white shadow-2xl overflow-hidden"
              style={{ width: 540, maxWidth: "95vw" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-1 w-full bg-gradient-to-r from-amber-400 to-orange-500" />
              <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-white">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-amber-500">Contributors</div>
                  <div className="text-sm font-bold text-slate-900">{selectedProject}</div>
                  <div className="text-[11px] text-slate-500">{projScatterData.length} contributor{projScatterData.length !== 1 ? "s" : ""}</div>
                </div>
                <button onClick={() => setSelectedProject(null)} className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-amber-100 hover:text-amber-700 text-lg leading-none shrink-0">×</button>
              </div>
              <div className="flex items-start gap-5 p-5">
                {/* Donut - hours share per contributor */}
                <div className="relative shrink-0" style={{ width: 180, height: 180 }}>
                  <PieChart width={180} height={180}>
                    <Pie
                      data={donutProjScatterData.map((d) => ({ name: d.name, value: d.hours, fill: d.fill }))}
                      cx={90}
                      cy={90}
                      innerRadius={52}
                      outerRadius={82}
                      dataKey="value"
                      paddingAngle={donutProjScatterData.length > 1 ? 2 : 0}
                      isAnimationActive={false}
                      strokeWidth={0}
                    >
                      {donutProjScatterData.map((d) => <Cell key={d.name} fill={d.fill} />)}
                    </Pie>
                    <Tooltip
                      formatter={(v, n) => [`${Number(v).toFixed(1)}h`, n]}
                      contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 11, background: "#fff" }}
                      wrapperStyle={{ zIndex: 50 }}
                    />
                  </PieChart>
                  {/* centre label */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <div className="text-lg font-bold text-slate-800">{projScatterData.reduce((s, d) => s + d.hours, 0).toFixed(0)}h</div>
                    <div className="text-[10px] text-slate-400">total hours</div>
                  </div>
                  <div className="absolute -bottom-9 left-1/2 w-max -translate-x-1/2">
                    <LevelLegend />
                  </div>
                </div>

                {/* Contributor table */}
                <div className="flex-1 min-w-0">
                  <table className="w-full text-xs border-collapse" style={{ tableLayout: "fixed" }}>
                    <colgroup>
                      <col />
                      <col style={{ width: 54 }} />
                      <col style={{ width: 64 }} />
                      {hasContribCompare && <col style={{ width: 64 }} />}
                    </colgroup>
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className={projectContributorThLeft}>
                          <button type="button" onClick={() => handleProjectContributorSort("name")} className="flex h-full w-full items-center gap-1 whitespace-nowrap leading-none text-left">
                            <span>Contributor</span>{projectContributorSortIcon("name")}
                          </button>
                        </th>
                        <th className={projectContributorThRight("hours")}>
                          <button type="button" onClick={() => handleProjectContributorSort("hours")} className="flex h-full w-full items-center justify-end gap-1 whitespace-nowrap leading-none text-right">
                            <span>Hours</span>{projectContributorSortIcon("hours")}
                          </button>
                        </th>
                        <th className={projectContributorThRight("revenue")}>
                          <button type="button" onClick={() => handleProjectContributorSort("revenue")} className="flex h-full w-full items-center justify-end gap-1 whitespace-nowrap leading-none text-right">
                            <span>Revenue</span>{projectContributorSortIcon("revenue")}
                          </button>
                        </th>
                        {hasContribCompare && <th className={projectContributorThRight("deltaHours")}>
                          <button type="button" onClick={() => handleProjectContributorSort("deltaHours")} className="flex h-full w-full items-center justify-end gap-1 whitespace-nowrap leading-none text-right">
                            <span>Δ Hours</span>{projectContributorSortIcon("deltaHours")}
                          </button>
                        </th>}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedProjScatterData.map((d) => {
                        const prevHours = hasContribCompare ? (prevPersonProjectMap.get(d.name)?.get(selectedProject)?.hours || 0) : null;
                        const hoursDelta = prevHours != null ? d.hours - prevHours : null;
                        return (
                          <tr key={d.name} className="border-b border-slate-50 hover:bg-slate-50">
                            <td className="py-2 pr-3">
                              <div className="flex items-start gap-1.5">
                                <span className="mt-0.5 h-2 w-2 rounded-full shrink-0" style={{ background: d.fill }} />
                                <span className="font-medium text-slate-700 leading-snug">{d.name}</span>
                              </div>
                            </td>
                            <td className="py-2 text-right font-medium text-blue-600 align-top">{d.hours.toFixed(1)}h</td>
                            <td className="py-2 text-right font-medium text-emerald-600 align-top">{fmtEUR(d.revenue)}</td>
                            {hasContribCompare && (
                              <td className={`py-2 text-right font-semibold align-top ${hoursDelta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                {hoursDelta >= 0 ? "▲" : "▼"}{Math.abs(hoursDelta).toFixed(1)}h
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200">
                        <td className="pt-2 font-bold text-slate-800">Total</td>
                        <td className="pt-2 text-right font-bold text-blue-700">{projScatterData.reduce((s, d) => s + d.hours, 0).toFixed(1)}h</td>
                        <td className="pt-2 text-right font-bold text-emerald-700">{fmtEUR(projScatterData.reduce((s, d) => s + d.revenue, 0))}</td>
                        {hasContribCompare && (() => {
                          const totalDeltaHours = projScatterData.reduce((sum, d) => sum + (d.hours - (prevPersonProjectMap.get(d.name)?.get(selectedProject)?.hours || 0)), 0);
                          return <td className={`pt-2 text-right font-bold ${totalDeltaHours >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{totalDeltaHours >= 0 ? "▲" : "▼"}{Math.abs(totalDeltaHours).toFixed(1)}h</td>;
                        })()}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ---------- compare view ---------- */

const COL_A = "#4f46e5"; // indigo
const COL_B = "#06b6d4"; // cyan

function RangeKpi({ label, rangeMonths, getValue, format, totalFn }) {
  const aggs = rangeMonths.map((m) => aggregateMonth(m.data));
  const values = aggs.map((agg) => getValue(agg));
  const total = totalFn ? totalFn(aggs) : values.reduce((s, v) => s + v, 0);
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 flex flex-col">
      <div className="h-1 w-full bg-gradient-to-r from-blue-400 to-cyan-400" />
      <div className="px-5 pt-4 pb-4 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</div>
        <div className="mt-3 space-y-1.5">
          {rangeMonths.map((m, i) => (
            <div key={m.key} className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500">{m.shortLabel}</span>
              <span className="text-sm font-semibold text-slate-700">{format(values[i])}</span>
            </div>
          ))}
          <div className="border-t border-slate-200 pt-2 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Total</span>
            <span className="text-base font-bold text-slate-900">{format(total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompareView({ rangeMonths }) {
  if (!rangeMonths || rangeMonths.length === 0) {
    return <div className="rounded-2xl bg-white p-6 text-sm text-slate-500 ring-1 ring-slate-200">Select a date range to compare.</div>;
  }

  const a = rangeMonths[0];
  const b = rangeMonths[rangeMonths.length - 1];
  const aggA = aggregateMonth(a.data);
  const aggB = aggregateMonth(b.data);

  const activePeopleA = aggA.activePeople;
  const activePeopleB = aggB.activePeople;
  const avgRevPerPersonA = activePeopleA > 0 ? aggA.revenue / activePeopleA : 0;
  const avgRevPerPersonB = activePeopleB > 0 ? aggB.revenue / activePeopleB : 0;

  const allNames = new Set();
  rangeMonths.forEach((m) => m.data.billing.forEach((p) => { if ((p.revenue || 0) > 0) allNames.add(p.name); }));
  const peopleInRange = [...allNames];

  const slopeData = rangeMonths.map((m) => ({
    month: m.shortLabel,
    ...Object.fromEntries(peopleInRange.map((name) => [name, m.data.billing.find((p) => p.name === name)?.revenue || 0])),
  }));

  const radarMetrics = [
    { label: "Revenue",        a: aggA.revenue,        b: aggB.revenue,        fmt: fmtEUR },
    { label: "Billable Hours", a: aggA.billingHours,   b: aggB.billingHours,   fmt: (v) => `${Math.round(v)}h` },
    { label: "Active People",  a: activePeopleA,        b: activePeopleB,        fmt: (v) => `${v}` },
    { label: "Rev / Person",   a: avgRevPerPersonA,     b: avgRevPerPersonB,     fmt: fmtEUR },
  ];
  const radarData = radarMetrics.map((m) => {
    const max = Math.max(Math.abs(m.a), Math.abs(m.b), 1);
    return {
      metric: m.label,
      A: (Math.max(0, m.a) / max) * 100,
      B: (Math.max(0, m.b) / max) * 100,
      _aRaw: m.a, _bRaw: m.b, _fmt: m.fmt,
    };
  });

  const rangeLabel = rangeMonths.length === 1
    ? a.shortLabel
    : `${a.shortLabel} – ${b.shortLabel}`;

  return (
    <div className="space-y-4">

      {/* Row 1: KPI cards - per month + total */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <RangeKpi label="Revenue"       rangeMonths={rangeMonths} getValue={(agg) => agg.revenue}      format={fmtEUR} />
        <RangeKpi label="Billable Hours" rangeMonths={rangeMonths} getValue={(agg) => agg.billingHours} format={(v) => `${Math.round(v)}h`} />
        <RangeKpi label="Active People" rangeMonths={rangeMonths} getValue={(agg) => agg.activePeople} format={(v) => `${v}`}
          totalFn={(aggs) => Math.max(...aggs.map((ag) => ag.activePeople))}
        />
      </div>

      {/* Row 2: Revenue per person across range */}
      <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <div className="flex items-start gap-2">
          <span className="mt-1 h-5 w-1 rounded-full" style={{ background: COL_A }} />
          <div>
            <h2 className="text-base font-semibold">Revenue per Person - {rangeLabel}</h2>
            <div className="text-[11px] text-slate-500">Each line is one person across the selected range</div>
          </div>
        </div>
        <div className="mt-3">
          <ScrollableChart numPoints={rangeMonths.length} height={420}>
            <LineChart data={slopeData} margin={{ left: 24, right: 80, top: 12, bottom: 4 }}>
              <CartesianGrid stroke="#eef2f7" strokeDasharray="2 3" vertical={false} />
              <XAxis dataKey="month" interval={0} tick={{ fontSize: 12, fill: "#475569", fontWeight: 600 }} axisLine={false} tickLine={false} padding={{ left: 40, right: 40 }} />
              <YAxis tickFormatter={fmtEUR} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={64} />
              <Tooltip
                formatter={(v) => fmtEUR(v)}
                contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
                itemSorter={(item) => -item.value}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              {peopleInRange.map((name, i) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={LINE_PALETTE[i % LINE_PALETTE.length]}
                  strokeWidth={2.2}
                  dot={{ r: 5, fill: LINE_PALETTE[i % LINE_PALETTE.length], strokeWidth: 0 }}
                  activeDot={{ r: 7 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ScrollableChart>
        </div>
      </div>

      {/* Row 3: Health Radar - first vs last month */}
      {rangeMonths.length >= 2 && (
        <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <div className="flex items-start gap-2">
            <span className="mt-1 h-5 w-1 rounded-full" style={{ background: COL_B }} />
            <div>
              <h2 className="text-base font-semibold">Health Radar - {a.shortLabel} vs {b.shortLabel}</h2>
              <div className="text-[11px] text-slate-500">First vs last month of range · each axis independently normalised · hover for real values</div>
            </div>
          </div>
          <div className="mt-3" style={{ width: "100%", height: 360 }}>
            <ResponsiveContainer>
              <RadarChart data={radarData} outerRadius={110}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: "#475569" }} />
                <PolarRadiusAxis angle={90} tick={false} axisLine={false} />
                <Radar name={a.shortLabel} dataKey="A" stroke={COL_A} fill={COL_A} fillOpacity={0.25} strokeWidth={2} isAnimationActive={false} />
                <Radar name={b.shortLabel} dataKey="B" stroke={COL_B} fill={COL_B} fillOpacity={0.25} strokeWidth={2} isAnimationActive={false} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                <Tooltip
                  formatter={(_, n, ctx) => {
                    const row = ctx?.payload || {};
                    const raw = n === a.shortLabel ? row._aRaw : row._bRaw;
                    const fmt = row._fmt || ((v) => v);
                    return [fmt(raw || 0), n];
                  }}
                  contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- seniority / role mix ---------- */

const LEVEL_COLORS = {
  "Senior":      "#2563eb",
  "Mid":         "#10b981",
  "Junior":      "#f59e0b",
  "Principal":   "#2563eb",
  "Mid-Level":   "#10b981",
  "Associate":   "#f59e0b",
  "Other":       "#94a3b8",
};
const LEVEL_ORDER = ["Senior", "Principal", "Mid", "Mid-Level", "Junior", "Associate", "Other"];

/* ---------- engagement health panel ---------- */

function EngagementHealthPanel({ yearAgg, customerLabel }) {
  const { annualCap, projectedYE, realizationRate } = yearAgg;
  const isOver  = realizationRate !== null && realizationRate > 100;
  const isUnder = realizationRate !== null && realizationRate < 70;
  const statusColor = !annualCap ? "#64748b" : isOver ? "#dc2626" : isUnder ? "#f59e0b" : "#10b981";
  const statusLabel = !annualCap ? "Set ceiling" : isOver ? "Overage risk" : isUnder ? "Under-paced" : "On track";

  const alerts = [];
  if (realizationRate !== null && realizationRate < 70)
    alerts.push("On-Track Rate below 70% of target");
  if (realizationRate !== null && realizationRate > 100)
    alerts.push("On pace to exceed contract ceiling");
  if (annualCap && projectedYE < annualCap * 0.7)
    alerts.push("Year-end forecast below 70% of ceiling");

  const tiles = [
    { label: "Client",          value: customerLabel,      sub: "Active · Ongoing engagement" },
    { label: "Billing Model",   value: "Time & Materials", sub: "Hourly billing · monthly invoices" },
    { label: "Contract Type",   value: "No fixed term",    sub: "Ongoing · no end date set" },
    {
      label: "Contract Ceiling",
      value: annualCap ? fmtEUR(annualCap) : "Not set",
      sub: annualCap ? "Agreed annual billing ceiling" : "Add a ceiling value to enable pace tracking",
      valueColor: !annualCap ? "#94a3b8" : undefined,
    },
    {
      label: "Delivery Status",
      value: statusLabel,
      valueColor: statusColor,
      sub: realizationRate != null ? `${realizationRate.toFixed(0)}% of expected pace` : "Set ceiling to track",
    },
    {
      label: "Active Alerts",
      value: alerts.length === 0 ? "None" : `${alerts.length} flag${alerts.length > 1 ? "s" : ""}`,
      valueColor: alerts.length > 0 ? "#dc2626" : "#10b981",
      sub: alerts.length > 0 ? alerts[0] : "No issues flagged",
    },
  ];

  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-start gap-2">
          <span className="mt-1 h-5 w-1 rounded-full bg-slate-300 shrink-0" />
          <div>
            <h2 className="text-base font-semibold">Engagement Health</h2>
            <div className="text-[11px] text-slate-500">Contract overview · billing model · delivery status</div>
          </div>
        </div>
        <span
          className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold ring-1"
          style={{ background: `${statusColor}18`, color: statusColor, borderColor: `${statusColor}40` }}
        >
          {statusLabel}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map(({ label, value, valueColor, sub }) => (
          <div key={label} className="rounded-xl bg-slate-50 px-3 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{label}</div>
            <div className="text-sm font-bold leading-snug" style={valueColor ? { color: valueColor } : { color: "#0f172a" }}>
              {value}
            </div>
            {sub && <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">{sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- access denied ---------- */

function AccessDeniedScreen({ detail, onRetry }) {
  const [showDetail, setShowDetail] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6 font-sans text-slate-900">
      <div className="w-full max-w-md text-center">
        <img src={hartsLogoUrl} alt="Harts" className="h-9 w-auto object-contain mx-auto mb-8" />

        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 ring-1 ring-rose-100">
          <Lock size={28} className="text-rose-500" />
        </div>

        <h1 className="text-lg font-bold text-slate-900">You don't have access to this dashboard</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          Your account isn't authorized to view this customer's invoice data yet. The SharePoint
          workbook behind this dashboard hasn't been shared with you.
        </p>

        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            onClick={onRetry}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition"
          >
            Try again
          </button>
          <a
            href="/"
            className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 transition"
          >
            ← Back to Apps
          </a>
          <a
            href="/api/auth/signout"
            className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 transition"
          >
            Sign out
          </a>
        </div>

        <p className="mt-6 text-xs text-slate-400">
          Think this is a mistake? Contact your Harts administrator to request access.
        </p>

        <button
          onClick={() => setShowDetail((v) => !v)}
          className="mt-4 text-[11px] font-medium text-slate-400 hover:text-slate-600 underline underline-offset-2"
        >
          {showDetail ? "Hide" : "Show"} technical details
        </button>
        {showDetail && (
          <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-slate-100 p-3 text-left text-[10px] leading-relaxed text-slate-500 whitespace-pre-wrap break-words">
            {detail}
          </pre>
        )}
      </div>
    </div>
  );
}

/* ---------- main ---------- */

export default function EvoraInvoiceDashboard() {
  const [months, setMonths] = useState([]);
  const [capsMap, setCapsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [activeView, setActiveView] = useState("overview");
  const [selectedCustomer, setSelectedCustomer] = useState(CUSTOMERS[0].key);
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [monthlyKey, setMonthlyKey] = useState(null);
  const [overviewYear, setOverviewYear] = useState(null);
  const [rangeFromKey, setRangeFromKey] = useState(null);
  const [rangeToKey, setRangeToKey] = useState(null);
  const [overviewProjectPage, setOverviewProjectPage] = useState(0);

  const loadRef = useRef(null);
  loadRef.current = async (force) => {
    try {
      // Unified auth: reaching /invoice already required a platform sign-in.
      // One call — the server resolves the workbook, opens a single Graph
      // session, reads every sheet concurrently under it, and parses the
      // result (see /api/invoice/data + lib/invoice-data.ts). `force` bypasses
      // the server's in-memory cache for a user-triggered refresh.
      const res = await fetch(force ? "/api/invoice/data?refresh=1" : "/api/invoice/data");
      if (res.status === 401) {
        window.location.href = "/sign-in?callbackUrl=%2Finvoice";
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `${res.status} ${res.statusText}`);
      }
      const { months: loaded, capsMap: capsData } = await res.json();

      setMonths(loaded);
      setCapsMap(capsData);
      setError(loaded.length ? "" : "No invoice data found in the workbook.");
      if (loaded.length) {
        const last = loaded[loaded.length - 1].key;
        const latestYear = parseInt(loaded[loaded.length - 1].shortLabel.match(/\d{4}/)?.[0]);
        const firstOfLatestYear = loaded.find(
          (m) => parseInt(m.shortLabel.match(/\d{4}/)?.[0]) === latestYear
        )?.key ?? loaded[0].key;
        setMonthlyKey((k) => k || last);
        setOverviewYear((y) => y ?? latestYear);
        setRangeFromKey((k) => k || firstOfLatestYear);
        setRangeToKey((k) => k || last);
      }
    } catch (e) {
      console.error("[invoice-dashboard] load failed:", e);
      setError(`Couldn't load invoice data: ${e?.message || e}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadRef.current(false);
  }, []);

  const handleRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    loadRef.current(true);
  };

  const overviewMonths = useMemo(() => {
    if (!months.length) return months;
    const fromIdx = rangeFromKey ? months.findIndex((m) => m.key === rangeFromKey) : 0;
    const toIdx = rangeToKey ? months.findIndex((m) => m.key === rangeToKey) : months.length - 1;
    const lo = Math.min(fromIdx >= 0 ? fromIdx : 0, toIdx >= 0 ? toIdx : months.length - 1);
    const hi = Math.max(fromIdx >= 0 ? fromIdx : 0, toIdx >= 0 ? toIdx : months.length - 1);
    return months.slice(lo, hi + 1);
  }, [months, rangeFromKey, rangeToKey]);

  // Latest year present in the loaded data. Overview stays tied to the current
  // operating year because its KPIs are YTD and pace-based.
  const years = useMemo(() => {
    const set = new Set();
    months.forEach((mm) => {
      const y = parseInt(mm.shortLabel.match(/\d{4}/)?.[0]);
      if (y) set.add(y);
    });
    return [...set].sort((a, b) => a - b);
  }, [months]);

  const latestYear = years[years.length - 1] ?? null;
  const selectedOverviewYear = overviewYear ?? latestYear;
  const isCurrentOverviewYear = selectedOverviewYear === latestYear;

  // Overview can inspect any loaded year. Current/latest year uses YTD and pace
  // language; prior years use retrospective labels.
  const yearMonths = useMemo(() => {
    if (!months.length) return months;
    if (!selectedOverviewYear) return months;
    return months.filter((mm) => parseInt(mm.shortLabel.match(/\d{4}/)?.[0]) === selectedOverviewYear);
  }, [months, selectedOverviewYear]);

  const yearTrend = useMemo(() => buildTrendRows(yearMonths, capsMap), [yearMonths, capsMap]);
  const yearAgg   = useMemo(() => buildYearAgg(yearTrend), [yearTrend]);
  const yearRevenueChartMax = useMemo(() => buildRevenueChartMax(yearTrend), [yearTrend]);

  const yearProjectRevenueSeries = useMemo(
    () => buildEntitySeries(yearMonths, (d) => {
      const map = new Map();
      d.billing.forEach((p) => p.projects.forEach((x) => {
        map.set(x.name, (map.get(x.name) || 0) + x.revenue);
      }));
      return [...map.entries()].map(([name, value]) => ({ name, value }));
    }),
    [yearMonths]
  );

  const yearProjectHoursSeries = useMemo(
    () => buildEntitySeries(yearMonths, (d) => {
      const map = new Map();
      d.billing.forEach((p) => p.projects.forEach((x) => {
        map.set(x.name, (map.get(x.name) || 0) + x.hours);
      }));
      return [...map.entries()].map(([name, value]) => ({ name, value }));
    }),
    [yearMonths]
  );

  const yearProjectHoursSeriesSynced = useMemo(() => {
    if (!yearProjectHoursSeries || !yearProjectRevenueSeries) return yearProjectHoursSeries;
    const revenueOrder = yearProjectRevenueSeries.entities.map((e) => e.name);
    const entityMap = new Map(yearProjectHoursSeries.entities.map((e) => [e.name, e]));
    const reordered = [
      ...revenueOrder.map((name) => entityMap.get(name)).filter(Boolean),
      ...yearProjectHoursSeries.entities.filter((e) => !revenueOrder.includes(e.name)),
    ];
    return { ...yearProjectHoursSeries, entities: reordered };
  }, [yearProjectHoursSeries, yearProjectRevenueSeries]);

  // Range-based trend, driven by the Trends tab's From/To pickers.
  const trend = useMemo(() => buildTrendRows(overviewMonths, capsMap), [overviewMonths, capsMap]);
  const revenueChartMax = useMemo(() => buildRevenueChartMax(trend), [trend]);

  const projectRevenueSeries = useMemo(
    () => buildEntitySeries(overviewMonths, (d) => {
      const map = new Map();
      d.billing.forEach((p) => p.projects.forEach((x) => {
        map.set(x.name, (map.get(x.name) || 0) + x.revenue);
      }));
      return [...map.entries()].map(([name, value]) => ({ name, value }));
    }),
    [overviewMonths]
  );

  const projectHoursSeries = useMemo(
    () => buildEntitySeries(overviewMonths, (d) => {
      const map = new Map();
      d.billing.forEach((p) => p.projects.forEach((x) => {
        map.set(x.name, (map.get(x.name) || 0) + x.hours);
      }));
      return [...map.entries()].map(([name, value]) => ({ name, value }));
    }),
    [overviewMonths]
  );

  // Hours series reordered to match revenue-sorted entity order so both charts page in sync
  const projectHoursSeriesSynced = useMemo(() => {
    if (!projectHoursSeries || !projectRevenueSeries) return projectHoursSeries;
    const revenueOrder = projectRevenueSeries.entities.map((e) => e.name);
    const entityMap = new Map(projectHoursSeries.entities.map((e) => [e.name, e]));
    const reordered = [
      ...revenueOrder.map((name) => entityMap.get(name)).filter(Boolean),
      ...projectHoursSeries.entities.filter((e) => !revenueOrder.includes(e.name)),
    ];
    return { ...projectHoursSeries, entities: reordered };
  }, [projectHoursSeries, projectRevenueSeries]);

  const fmtHours = (v) => `${Math.round(v)}h`;

  const isAccessDenied = /\b403\b/.test(error) || /accessDenied/i.test(error);
  if (!loading && isAccessDenied) {
    return <AccessDeniedScreen detail={error} onRetry={handleRefresh} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 px-8 py-5 font-sans text-slate-900">
      <div className="mx-auto w-full max-w-[1600px]">

        {/* header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="flex flex-1 items-center gap-4">
            <img src={hartsLogoUrl} alt="Harts" className="h-10 w-auto object-contain" />
            <div className="pl-4 border-l border-slate-200">
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Customer Engagement Health Dashboard</h1>
            </div>

            {/* Customer selector */}
            <div className="relative ml-auto">
              <button
                onClick={() => setCustomerDropdownOpen((v) => !v)}
                className={`flex items-center gap-3 rounded-2xl px-3 py-2 transition focus:outline-none border ${customerDropdownOpen ? "bg-indigo-50 border-indigo-200 shadow-sm" : "bg-white border-slate-200 hover:bg-indigo-50 hover:border-indigo-200 shadow-sm"}`}
              >
                {(() => { const cust = CUSTOMERS.find((c) => c.key === selectedCustomer); return cust?.logo
                  ? <img src={cust.logo} alt={cust.label} className="h-8 w-8 rounded-xl object-contain bg-white border border-slate-100 shrink-0" />
                  : <div className="h-8 w-8 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}>{cust?.label[0]}</div>;
                })()}
                <div className="text-left leading-tight">
                  <div className="text-[9px] font-semibold uppercase tracking-widest text-indigo-400">Customer</div>
                  <div className="text-sm font-bold text-slate-900">
                    {CUSTOMERS.find((c) => c.key === selectedCustomer)?.label}
                  </div>
                </div>
                <svg className="ml-1 h-3.5 w-3.5 text-slate-400 shrink-0" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4.5 6.5l3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
              </button>

              {customerDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setCustomerDropdownOpen(false)} />
                  <div className="absolute left-0 top-full mt-2 z-50 rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 p-2" style={{ minWidth: 200 }}>
                    <div className="px-3 pt-2 pb-1.5 text-[9px] font-semibold uppercase tracking-widest text-slate-400">
                      Select Customer
                    </div>
                    {CUSTOMERS.map((c) => (
                      <button
                        key={c.key}
                        onClick={() => { setSelectedCustomer(c.key); setCustomerDropdownOpen(false); }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition ${c.key === selectedCustomer ? "bg-indigo-50" : "hover:bg-slate-50"}`}
                      >
                        {c.logo
                          ? <img src={c.logo} alt={c.label} className="h-8 w-8 rounded-xl object-contain bg-white border border-slate-100 shrink-0" />
                          : <div className="h-8 w-8 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}>{c.label[0]}</div>
                        }
                        <span className={`flex-1 text-left text-sm font-semibold ${c.key === selectedCustomer ? "text-indigo-700" : "text-slate-700"}`}>
                          {c.label}
                        </span>
                        {c.key === selectedCustomer && (
                          <svg className="h-4 w-4 text-indigo-500" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M3 8l3.5 3.5 6.5-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              title="Reload the latest data from the workbook, bypassing the cache"
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            <a
              href="/"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 transition"
            >
              ← Apps
            </a>
            <a
              href="/api/auth/signout"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 transition"
            >
              Sign out
            </a>
          </div>
        </div>

        {loading && (
          <div className="mt-3 text-sm text-slate-500">Loading invoice data…</div>
        )}

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}

        {/* tab bar + per-view controls */}
        {months.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <ViewTabs active={activeView} onChange={setActiveView} />
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-100/60 pl-3 pr-2 py-1">
              {activeView === "overview" && (
                <YearPicker
                  years={years}
                  value={selectedOverviewYear ?? years[years.length - 1]}
                  onChange={(year) => { setOverviewYear(year); setOverviewProjectPage(0); }}
                  label="Year"
                  accent="#4f46e5"
                />
              )}
              {activeView === "monthly" && (
                <MonthPicker
                  months={months}
                  value={monthlyKey || months[months.length - 1].key}
                  onChange={setMonthlyKey}
                  label="Month"
                  accent="#2563eb"
                />
              )}
            </div>
          </div>
        )}

        {activeView === "monthly" && months.length > 0 && (
          <div className="mt-4">
            {(() => {
              const idx = months.findIndex((m) => m.key === (monthlyKey || months[months.length - 1].key));
              const cur = months[idx] || months[months.length - 1];
              const prev = idx > 0 ? months[idx - 1] : null;
              return <MonthlyView month={cur} prevMonth={prev} />;
            })()}
          </div>
        )}

        {activeView !== "overview" || months.length === 0 ? null : (
        <>

        {/* ── KPI row ── */}
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label={
              isCurrentOverviewYear
                ? yearTrend.length >= 12
                  ? `Revenue · ${selectedOverviewYear} · Full Year`
                  : `Revenue YTD · ${yearTrend.length} month${yearTrend.length !== 1 ? "s" : ""}`
                : `Revenue · ${selectedOverviewYear} · ${yearTrend.length >= 12 ? "Full Year" : `${yearTrend.length} months recorded`}`
            }
            value={fmtEUR(yearAgg.revenue)}
            tone="blue"
            breakdown={yearAgg.annualCap ? [{ label: `of ${fmtEUR(yearAgg.annualCap)} ceiling`, value: `${(yearAgg.capProgress || 0).toFixed(1)}%` }] : undefined}
          />
          <Kpi
            label={isCurrentOverviewYear ? "YTD On-Track Rate" : "Ceiling Utilization"}
            value={
              isCurrentOverviewYear
                ? yearAgg.realizationRate != null ? `${yearAgg.realizationRate.toFixed(1)}%` : "-"
                : yearAgg.capProgress != null ? `${yearAgg.capProgress.toFixed(1)}%` : "-"
            }
            tone={
              isCurrentOverviewYear
                ? yearAgg.realizationRate == null ? "blue"
                : yearAgg.realizationRate < 70   ? "amber"
                : yearAgg.realizationRate > 100  ? "red"
                : "green"
              : yearAgg.capProgress == null ? "blue"
              : yearAgg.capProgress > 100    ? "red"
              : yearAgg.capProgress < 70     ? "amber"
              : "green"
            }
            breakdown={[{
              label: isCurrentOverviewYear
                ? yearAgg.realizationRate == null ? "set contract ceiling" : "of expected pace"
                : yearAgg.annualCap ? "of annual ceiling" : "set contract ceiling",
              value: isCurrentOverviewYear
                ? yearAgg.realizationRate == null ? "Ceiling not set"
                  : yearAgg.realizationRate < 70    ? "⚠ Below target"
                  : yearAgg.realizationRate > 100   ? "⚠ Overage risk"
                  : "✓ On target"
                : yearAgg.annualCap ? fmtEUR(yearAgg.annualCap) : "Ceiling not set",
            }]}
          />
          <Kpi
            label={isCurrentOverviewYear ? "Projected Year-End" : "Monthly Average"}
            value={isCurrentOverviewYear ? fmtEUR(yearAgg.projectedYE) : fmtEUR(yearAgg.monthlyAvg)}
            tone={
              isCurrentOverviewYear
                ? !yearAgg.annualCap           ? "blue"
                : yearAgg.projectedYE > yearAgg.annualCap          ? "red"
                : yearAgg.projectedYE < yearAgg.annualCap * 0.7    ? "amber"
                : "green"
              : "blue"
            }
            breakdown={
              isCurrentOverviewYear
                ? yearAgg.annualCap ? [{
                  label: "vs ceiling",
                  value: yearAgg.projectedYE > yearAgg.annualCap
                    ? "Exceeds ceiling"
                    : `${(yearAgg.projectedYE / yearAgg.annualCap * 100).toFixed(0)}% of ceiling`,
                }] : undefined
                : [{ label: "recorded months", value: `${yearTrend.length}` }]
            }
          />
          {yearAgg.annualCap && (
            <Kpi
              label={isCurrentOverviewYear ? "Ceiling Remaining" : "Final Variance"}
              value={fmtEUR(yearAgg.annualCap - yearAgg.revenue)}
              tone={!isCurrentOverviewYear && yearAgg.annualCap - yearAgg.revenue < 0 ? "red" : "blue"}
              breakdown={[{
                label: isCurrentOverviewYear
                  ? "of ceiling still available"
                  : yearAgg.annualCap - yearAgg.revenue < 0 ? "above ceiling" : "below ceiling",
                value: isCurrentOverviewYear
                  ? `${((yearAgg.annualCap - yearAgg.revenue) / yearAgg.annualCap * 100).toFixed(1)}%`
                  : `${Math.abs((yearAgg.annualCap - yearAgg.revenue) / yearAgg.annualCap * 100).toFixed(1)}%`,
              }]}
            />
          )}
        </div>

        {/* ── Revenue vs contract ceiling, primary chart, full width ── */}
        <RevenueTrendChart trend={yearTrend} revenueChartMax={yearRevenueChartMax} />

        {/* ── Projectwise Revenue + Hours ── */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {yearProjectRevenueSeries.entities.length > 0 && (
            <MultiLineChart
              title="Projectwise Revenue"
              subtitle={`Per-month billed revenue per project · ${selectedOverviewYear} · click chart or Table for full breakdown`}
              accent="#f59e0b"
              series={yearProjectRevenueSeries}
              valueFormatter={fmtEUR}
              page={overviewProjectPage}
              onPageChange={setOverviewProjectPage}
            />
          )}
          {yearProjectHoursSeriesSynced.entities.length > 0 && (
            <MultiLineChart
              title="Projectwise Hours"
              subtitle={`Per-month hours per project · ${selectedOverviewYear} · sorted by revenue`}
              accent="#0ea5e9"
              series={yearProjectHoursSeriesSynced}
              valueFormatter={fmtHours}
              page={overviewProjectPage}
              onPageChange={setOverviewProjectPage}
            />
          )}
        </div>

        </>
        )}
      </div>
    </div>
  );
}
