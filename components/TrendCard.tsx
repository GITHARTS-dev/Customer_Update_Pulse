"use client";

import { useEffect, useState } from "react";

export interface TrendPoint {
  label: string;
  value: number;
  color?: string;
  detail?: string;
}

interface TrendCardProps {
  title: string;
  points: TrendPoint[];
  suffix?: string;
  emptyMessage?: string;
  helpText?: string;
}

const ACCENT = "#6C47E8";
const AXIS = "#E5E2F1";
const AXIS_TEXT = "#948FAB";

function computeGeom(
  points: TrendPoint[],
  w: number,
  h: number,
  padX: number,
  padY: number
): { pts: Array<TrendPoint & { x: number; y: number }>; baselineY: number; min: number; max: number } {
  const values = points.map((p) => p.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 100);
  const range = Math.max(1, max - min);
  const chartW = w - 2 * padX;
  const chartH = h - 2 * padY;
  const baselineY = padY + chartH;
  const pts = points.map((p, i) => {
    const x =
      points.length > 1
        ? padX + (i * chartW) / (points.length - 1)
        : padX + chartW / 2;
    const y = padY + chartH * (1 - (p.value - min) / range);
    return { ...p, x, y };
  });
  return { pts, baselineY, min, max };
}

export function TrendCard({
  title,
  points,
  suffix = "",
  emptyMessage = "No weeks yet.",
  helpText
}: TrendCardProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (points.length === 0) {
    return (
      <div className="card px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider text-ink-400 truncate">
            {title}
          </span>
          <span className="text-[10px] text-ink-400 shrink-0">no data</span>
        </div>
        <div className="mt-2.5 h-14 rounded-md bg-sand-50 border border-dashed border-sand-200 flex items-center justify-center">
          <span className="text-[11px] text-ink-400">{emptyMessage}</span>
        </div>
      </div>
    );
  }

  const latest = points[points.length - 1];
  const prior = points.length > 1 ? points[points.length - 2] : undefined;
  const delta = prior ? latest.value - prior.value : 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="card px-4 py-3 text-left w-full hover:shadow-hero transition-shadow"
        aria-label={`${title} — expand for details`}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider text-ink-400 truncate">
            {title}
          </span>
          <span className="text-[10px] text-ink-400 shrink-0">
            {points.length === 1 ? "1 week" : `${points.length} weeks`}
          </span>
        </div>

        <div className="mt-2.5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
          <div className="w-full sm:w-[200px] sm:shrink-0">
            <MiniChart points={points} />
          </div>
          <div className="sm:flex-1 sm:min-w-0 flex items-baseline sm:flex-col sm:items-start gap-x-2 gap-y-0.5">
            <span className="stat-num text-2xl leading-none text-ink-900">
              {latest.value}
              {suffix}
            </span>
            <span className="text-[10px] text-ink-400">{latest.label}</span>
            {prior ? (
              <span
                className={`text-[10px] font-medium sm:mt-1.5 whitespace-nowrap ${
                  delta > 0
                    ? "text-leaf"
                    : delta < 0
                      ? "text-crimson"
                      : "text-ink-400"
                }`}
              >
                {delta > 0 ? "↑" : delta < 0 ? "↓" : "→"} {Math.abs(delta)}
                {suffix}
                <span className="text-ink-400 font-normal"> vs {prior.label}</span>
              </span>
            ) : (
              <span className="text-[10px] text-ink-400 sm:mt-1.5">first week in</span>
            )}
          </div>
        </div>
      </button>

      {open && (
        <TrendModal
          title={title}
          points={points}
          suffix={suffix}
          helpText={helpText}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function MiniChart({ points }: { points: TrendPoint[] }) {
  const W = 200;
  const H = 68;
  const padX = 8;
  const padY = 10;
  const { pts, baselineY } = computeGeom(points, W, H, padX, padY);

  const linePath =
    pts.length > 1
      ? pts
          .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
          .join(" ")
      : "";
  const areaPath =
    pts.length > 1
      ? `${linePath} L ${pts[pts.length - 1].x.toFixed(1)} ${baselineY.toFixed(
          1
        )} L ${pts[0].x.toFixed(1)} ${baselineY.toFixed(1)} Z`
      : "";

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="w-full h-16 sm:h-[68px] block overflow-visible"
      aria-hidden="true"
    >
      <line
        x1={padX}
        y1={baselineY}
        x2={W - padX}
        y2={baselineY}
        stroke={AXIS}
        strokeWidth="0.8"
      />
      {pts.length === 1 && (
        <line
          x1={padX}
          y1={pts[0].y}
          x2={W - padX}
          y2={pts[0].y}
          stroke={ACCENT}
          strokeOpacity="0.25"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
      )}
      {areaPath && <path d={areaPath} fill={ACCENT} fillOpacity="0.12" />}
      {linePath && (
        <path
          d={linePath}
          fill="none"
          stroke={ACCENT}
          strokeOpacity="0.9"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {pts.map((pt, i) => {
        const isLast = i === pts.length - 1;
        return (
          <g key={i}>
            {isLast && (
              <circle
                cx={pt.x}
                cy={pt.y}
                r={5}
                fill={pt.color ?? ACCENT}
                fillOpacity="0.2"
              />
            )}
            <circle
              cx={pt.x}
              cy={pt.y}
              r={isLast ? 3 : 1.8}
              fill={pt.color ?? ACCENT}
              stroke="#FCFBFF"
              strokeWidth={isLast ? 1.4 : 0}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
      })}
    </svg>
  );
}

interface TrendModalProps {
  title: string;
  points: TrendPoint[];
  suffix: string;
  helpText?: string;
  onClose: () => void;
}

function TrendModal({
  title,
  points,
  suffix,
  helpText,
  onClose
}: TrendModalProps) {
  const latest = points[points.length - 1];
  const prior = points.length > 1 ? points[points.length - 2] : undefined;
  const delta = prior ? latest.value - prior.value : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/45 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="card w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 sm:p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-serif text-xl text-ink-900 leading-tight">{title}</h3>
            {helpText && (
              <p className="text-xs text-ink-500 mt-1">{helpText}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-ink-400 hover:text-ink-700 text-lg leading-none p-1 -m-1 shrink-0"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 flex items-baseline flex-wrap gap-x-3 gap-y-1">
          <span className="stat-num text-2xl text-ink-900 leading-none">
            {latest.value}
            {suffix}
          </span>
          <span className="text-[11px] text-ink-500">this week ({latest.label})</span>
          {prior ? (
            <span
              className={`text-[11px] font-medium ${
                delta > 0
                  ? "text-leaf"
                  : delta < 0
                    ? "text-crimson"
                    : "text-ink-400"
              }`}
            >
              {delta > 0 ? "↑" : delta < 0 ? "↓" : "→"} {Math.abs(delta)}
              {suffix} vs {prior.label}
            </span>
          ) : (
            <span className="text-[11px] text-ink-400">first week recorded</span>
          )}
        </div>

        <div className="mt-4 rounded-xl bg-sand-50 border border-sand-200 px-3 pt-3 pb-2">
          <BigChart points={points} suffix={suffix} />
        </div>

        <div className="mt-5 flex items-baseline justify-between">
          <span className="text-[9px] uppercase tracking-[0.14em] text-ink-400">
            By week
          </span>
          <span className="text-[10px] text-ink-400">
            {points.length === 1 ? "1 entry" : `${points.length} entries`}
          </span>
        </div>
        <ul className="mt-1.5 divide-y divide-sand-200">
          {[...points].reverse().map((p, i) => {
            const isCurrent = i === 0;
            const width = Math.max(0, Math.min(100, p.value));
            return (
              <li
                key={i}
                className="flex items-center gap-3 sm:gap-4 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: p.color ?? ACCENT }}
                    />
                    <span className="text-sm font-medium text-ink-900">
                      {p.label}
                    </span>
                    {isCurrent && (
                      <span className="text-[9px] uppercase tracking-wider text-coral font-medium">
                        latest
                      </span>
                    )}
                  </div>
                  {p.detail && (
                    <div className="text-[11px] text-ink-500 mt-0.5 ml-4">
                      {p.detail}
                    </div>
                  )}
                </div>
                <div className="w-16 sm:w-24 h-1.5 rounded-full bg-sand-200 overflow-hidden shrink-0">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${width}%`,
                      backgroundColor: p.color ?? ACCENT
                    }}
                  />
                </div>
                <span className="stat-num text-ink-800 text-sm w-11 text-right shrink-0">
                  {p.value}
                  {suffix}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function BigChart({ points, suffix }: { points: TrendPoint[]; suffix: string }) {
  const W = 480;
  const H = 150;
  const padX = 28;
  const padY = 18;
  const { pts, baselineY } = computeGeom(points, W, H, padX, padY);
  const chartH = H - 2 * padY;

  const linePath =
    pts.length > 1
      ? pts
          .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
          .join(" ")
      : "";
  const areaPath =
    pts.length > 1
      ? `${linePath} L ${pts[pts.length - 1].x.toFixed(1)} ${baselineY.toFixed(
          1
        )} L ${pts[0].x.toFixed(1)} ${baselineY.toFixed(1)} Z`
      : "";

  return (
    <svg
      viewBox={`0 0 ${W} ${H + 16}`}
      className="w-full h-auto"
      aria-hidden="true"
    >
      {[0, 50, 100].map((v) => {
        const y = padY + chartH * (1 - v / 100);
        return (
          <g key={v}>
            <line
              x1={padX}
              y1={y}
              x2={W - padX}
              y2={y}
              stroke={AXIS}
              strokeWidth="0.7"
            />
            <text
              x={padX - 6}
              y={y + 3}
              fontSize="9"
              fill={AXIS_TEXT}
              textAnchor="end"
            >
              {v}
              {suffix}
            </text>
          </g>
        );
      })}
      {pts.length === 1 && (
        <line
          x1={padX}
          y1={pts[0].y}
          x2={W - padX}
          y2={pts[0].y}
          stroke={ACCENT}
          strokeOpacity="0.28"
          strokeWidth="1"
          strokeDasharray="4 4"
        />
      )}
      {areaPath && <path d={areaPath} fill={ACCENT} fillOpacity="0.10" />}
      {linePath && (
        <path
          d={linePath}
          fill="none"
          stroke={ACCENT}
          strokeOpacity="0.9"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {pts.map((pt, i) => {
        const isLast = i === pts.length - 1;
        return (
          <g key={i}>
            {isLast && (
              <circle
                cx={pt.x}
                cy={pt.y}
                r={7}
                fill={pt.color ?? ACCENT}
                fillOpacity="0.18"
              />
            )}
            <circle
              cx={pt.x}
              cy={pt.y}
              r={isLast ? 4 : 3}
              fill={pt.color ?? ACCENT}
              stroke="#FCFBFF"
              strokeWidth={isLast ? 2 : 1}
            />
            <text
              x={pt.x}
              y={baselineY + 13}
              fontSize="9"
              fill={AXIS_TEXT}
              textAnchor="middle"
            >
              {pt.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
