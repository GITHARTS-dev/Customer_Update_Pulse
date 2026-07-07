import type { Vibe } from "@/lib/types";

interface BabyElephantProps {
  vibe: Vibe;
  size?: number;
  className?: string;
  background?: boolean;
  animated?: boolean;
}

const HALO: Record<Vibe, string> = {
  going_well: "#3BA46A",
  watch_it: "#E8A020",
  stuck: "#D6473F",
  quiet_week: "#3E8FCF"
};

const BODY = "#95A8B5";
const BODY_SHADE = "#7E92A0";
const BODY_DARK = "#6B7E8B";
const BELLY = "#C5D1D9";
const SHEEN = "#B6C4CE";
const EAR_INNER = "#F3D5BE";
const BLUSH = "#E89A8A";
const OUTLINE = "#3F4A55";
const EYE = "#1F1B30";

/**
 * Living mascot. Every body part sits in its own group
 * (.ele-ear-left, .ele-ear-right, .ele-head, .ele-trunk, .ele-whole)
 * and CSS in globals.css animates each part per-vibe when the root
 * carries .ele-live — ears flap, heads tilt, trunks sway.
 */
export function BabyElephant({
  vibe,
  size = 96,
  className,
  background = true,
  animated = false
}: BabyElephantProps) {
  const stroke = Math.max(1.1, size / 80);

  return (
    <svg
      viewBox="0 0 100 110"
      width={size}
      height={size}
      data-vibe={vibe}
      className={[className, animated ? "ele-live" : ""].filter(Boolean).join(" ") || undefined}
      aria-hidden="true"
    >
      {background && (
        <circle cx="50" cy="58" r="52" fill={HALO[vibe]} opacity="0.14" />
      )}

      <g className="ele-whole">
        {/* ---- tail (peeks from behind the body) ---- */}
        <g className="ele-tail">
          <path
            d="M 76 77 Q 87 79.5 86 86"
            fill="none"
            stroke={OUTLINE}
            strokeWidth={4.4}
            strokeLinecap="round"
          />
          <path
            d="M 76 77 Q 87 79.5 86 86"
            fill="none"
            stroke={BODY}
            strokeWidth={2.8}
            strokeLinecap="round"
          />
          <path
            d="M 86 85 Q 89.2 87.6 86.9 90.4 Q 84.3 88.3 85.1 85.6 Z"
            fill={BODY_DARK}
            stroke={OUTLINE}
            strokeWidth={0.7}
            strokeLinejoin="round"
          />
        </g>

        {/* ---- body ---- */}
        <g className="ele-body">
          <ellipse cx="20" cy="94" rx="7" ry="5" fill={BODY_SHADE} stroke={OUTLINE} strokeWidth={stroke} />
          <ellipse cx="80" cy="94" rx="7" ry="5" fill={BODY_SHADE} stroke={OUTLINE} strokeWidth={stroke} />
          <ellipse cx="50" cy="74" rx="27" ry="22" fill={BODY} stroke={OUTLINE} strokeWidth={stroke} />
          <ellipse cx="50" cy="80" rx="15" ry="11" fill={BELLY} />
          <ellipse cx="34" cy="94" rx="9.5" ry="6" fill={BODY} stroke={OUTLINE} strokeWidth={stroke} />
          <ellipse cx="66" cy="94" rx="9.5" ry="6" fill={BODY} stroke={OUTLINE} strokeWidth={stroke} />
          <g fill={BELLY}>
            <ellipse cx="29" cy="96" rx="1.3" ry="1" />
            <ellipse cx="34" cy="97" rx="1.3" ry="1" />
            <ellipse cx="39" cy="96" rx="1.3" ry="1" />
            <ellipse cx="61" cy="96" rx="1.3" ry="1" />
            <ellipse cx="66" cy="97" rx="1.3" ry="1" />
            <ellipse cx="71" cy="96" rx="1.3" ry="1" />
          </g>
        </g>

        {/* ---- ears (behind head) ---- */}
        <g className="ele-ear-left">
          <path
            d="M 30 28 C 14 22, 2 32, 4 50 C 6 62, 20 62, 32 54 Z"
            fill={BODY}
            stroke={OUTLINE}
            strokeWidth={stroke}
            strokeLinejoin="round"
          />
          <path d="M 28 33 C 17 30, 9 38, 11 50 C 13 58, 22 58, 30 52 Z" fill={EAR_INNER} />
        </g>
        <g className="ele-ear-right">
          <path
            d="M 70 28 C 86 22, 98 32, 96 50 C 94 62, 80 62, 68 54 Z"
            fill={BODY}
            stroke={OUTLINE}
            strokeWidth={stroke}
            strokeLinejoin="round"
          />
          <path d="M 72 33 C 83 30, 91 38, 89 50 C 87 58, 78 58, 70 52 Z" fill={EAR_INNER} />
        </g>

        {/* ---- head (face rides along) ---- */}
        <g className="ele-head">
          <ellipse cx="50" cy="40" rx="22" ry="20" fill={BODY} stroke={OUTLINE} strokeWidth={stroke} />
          <g stroke={OUTLINE} strokeWidth={stroke * 1.4} strokeLinecap="round" fill="none">
            <path d="M 47 19 Q 48 13 49.5 19" />
            <path d="M 51 19 Q 52.5 12 54 19" />
          </g>
          <ellipse cx="33" cy="48" rx="4.2" ry="3" fill={BLUSH} opacity="0.7" />
          <ellipse cx="67" cy="48" rx="4.2" ry="3" fill={BLUSH} opacity="0.7" />
          {renderBrows(vibe, stroke)}
          {renderEyes(vibe, stroke)}
          {renderMouth(vibe, stroke)}
        </g>

        {/* ---- trunk ---- */}
        {renderTrunk(vibe, stroke)}

        {/* ---- accents (sparkles, tears, Zzz) ---- */}
        {renderAccent(vibe, stroke)}
      </g>
    </svg>
  );
}

function renderBrows(vibe: Vibe, stroke: number) {
  const common = {
    fill: "none",
    stroke: OUTLINE,
    strokeWidth: stroke * 1.3,
    strokeLinecap: "round" as const
  };
  if (vibe === "watch_it") {
    return (
      <g {...common} className="ele-brows">
        <path d="M 36 33 L 46 36" />
        <path d="M 54 36 L 64 33" />
      </g>
    );
  }
  if (vibe === "stuck") {
    return (
      <g {...common} className="ele-brows">
        <path d="M 36 36 L 46 32" />
        <path d="M 54 32 L 64 36" />
      </g>
    );
  }
  if (vibe === "going_well") {
    return (
      <g {...common} className="ele-brows">
        <path d="M 36 31 Q 41 28 46 31" />
        <path d="M 54 31 Q 59 28 64 31" />
      </g>
    );
  }
  return null;
}

function renderEyes(vibe: Vibe, stroke: number) {
  if (vibe === "going_well") {
    return (
      <g stroke={EYE} strokeWidth={stroke * 2.2} strokeLinecap="round" fill="none">
        <path d="M 37 42 Q 42 36 47 42" />
        <path d="M 53 42 Q 58 36 63 42" />
      </g>
    );
  }
  if (vibe === "watch_it") {
    return (
      <g>
        <g fill="white" stroke={EYE} strokeWidth={stroke * 0.6}>
          <ellipse cx="42" cy="41" rx="3.6" ry="3.8" />
          <ellipse cx="58" cy="41" rx="3.6" ry="3.8" />
        </g>
        <g className="ele-pupils">
          <g fill={EYE}>
            <ellipse cx="43.6" cy="41.5" rx="1.9" ry="2.4" />
            <ellipse cx="59.6" cy="41.5" rx="1.9" ry="2.4" />
          </g>
          <g fill="white">
            <circle cx="44.2" cy="40.4" r="0.7" />
            <circle cx="60.2" cy="40.4" r="0.7" />
          </g>
        </g>
      </g>
    );
  }
  if (vibe === "stuck") {
    return (
      <g>
        <g fill={EYE}>
          <circle cx="42" cy="41" r="3.4" />
          <circle cx="58" cy="41" r="3.4" />
        </g>
        <g fill="white">
          <circle cx="40.8" cy="39.8" r="0.7" />
          <circle cx="56.8" cy="39.8" r="0.7" />
        </g>
      </g>
    );
  }
  return (
    <g stroke={EYE} strokeWidth={stroke * 2.2} strokeLinecap="round" fill="none">
      <path d="M 37 41 L 47 41" />
      <path d="M 53 41 L 63 41" />
    </g>
  );
}

function renderMouth(vibe: Vibe, stroke: number) {
  const common = {
    fill: "none",
    stroke: OUTLINE,
    strokeWidth: stroke * 1.1,
    strokeLinecap: "round" as const
  };
  if (vibe === "going_well") {
    return <path d="M 47 57 Q 50 60 53 57" {...common} />;
  }
  if (vibe === "stuck") {
    return <path d="M 47 58 Q 50 55 53 58" {...common} />;
  }
  if (vibe === "watch_it") {
    return <path d="M 47 57 Q 50 56 53 57" {...common} />;
  }
  return <path d="M 48 57 L 52 57" {...common} />;
}

interface TrunkSpec {
  path: string;
  taper: string;
  tipCap: string;
  wrinkles: string[];
  shade?: string;
  tip: [number, number];
  tipAngle: number;
}

const TRUNKS: Record<Vibe, TrunkSpec> = {
  going_well: {
    path: "M 50 55 Q 60 56 68 49 Q 76 40 72 30 Q 64 22 60 32",
    taper: "M 62 52 Q 70 46 72 37 Q 74 28 66 25 Q 60 25 60 32",
    tipCap: "M 68 32 Q 68 25 62 25 Q 59 26 60 32",
    wrinkles: [
      "M 54 59 Q 56 57 58 59",
      "M 60 57 Q 62 55 64 56",
      "M 65 53 Q 67 51 69 52",
      "M 70 47 Q 72 44 73 46",
      "M 73 38 Q 74 34 72 33",
      "M 68 29 Q 66 27 64 28"
    ],
    shade: "M 51 58 Q 60 59 66 53 Q 72 46 70 38",
    tip: [60, 32],
    tipAngle: 190
  },
  watch_it: {
    path: "M 48 56 Q 54 66 62 72 Q 74 78 68 66",
    taper: "M 54 66 Q 62 73 68 74 Q 74 74 70 68",
    tipCap: "M 66 70 Q 72 73 71 68 Q 70 65 68 66",
    wrinkles: [
      "M 49 60 Q 51 60 53 62",
      "M 54 65 Q 56 65 58 67",
      "M 60 70 Q 62 71 64 73",
      "M 67 74 Q 69 74 70 71",
      "M 70 68 Q 71 67 70 66"
    ],
    shade: "M 47 58 Q 52 66 58 71 Q 66 76 68 72",
    tip: [68, 66],
    tipAngle: 330
  },
  stuck: {
    path: "M 48 56 Q 40 66 32 78 Q 24 88 30 90",
    taper: "M 38 68 Q 30 78 26 86 Q 24 90 30 90",
    tipCap: "M 26 88 Q 25 92 30 90 Q 33 88 30 87",
    wrinkles: [
      "M 46 60 Q 45 62 48 62",
      "M 40 66 Q 39 68 43 68",
      "M 34 74 Q 33 76 37 76",
      "M 28 82 Q 27 84 30 84",
      "M 25 88 Q 26 91 30 90"
    ],
    shade: "M 46 55 Q 39 65 32 76 Q 26 85 30 89",
    tip: [30, 89],
    tipAngle: 115
  },
  quiet_week: {
    path: "M 50 56 Q 56 60 56 66 Q 55 71 48 69",
    taper: "M 54 60 Q 57 65 55 69 Q 52 71 49 70",
    tipCap: "M 52 70 Q 49 71 48 69 Q 48 67 50 67",
    wrinkles: [
      "M 51 60 Q 53 60 54 62",
      "M 54 63 Q 55 63 55 65",
      "M 54 67 Q 55 68 54 69",
      "M 52 70 Q 51 69 50 69"
    ],
    shade: "M 50 58 Q 54 62 54 66 Q 53 70 49 68",
    tip: [48, 69],
    tipAngle: 105
  }
};

function renderTrunk(vibe: Vibe, stroke: number) {
  const t = TRUNKS[vibe];
  return (
    <g className="ele-trunk">
      <path
        d={t.path}
        fill="none"
        stroke={OUTLINE}
        strokeOpacity="0.16"
        strokeWidth={12}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={t.path}
        fill="none"
        stroke={BODY}
        strokeWidth={10}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={t.taper}
        fill="none"
        stroke={BODY}
        strokeWidth={8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={t.tipCap}
        fill="none"
        stroke={BODY}
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {t.shade && (
        <path
          d={t.shade}
          fill="none"
          stroke={BODY_DARK}
          strokeOpacity="0.35"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      )}
      <path
        d={t.taper}
        fill="none"
        stroke={SHEEN}
        strokeOpacity="0.55"
        strokeWidth={2.2}
        strokeLinecap="round"
      />
      <path
        d={t.path}
        fill="none"
        stroke={OUTLINE}
        strokeOpacity="0.75"
        strokeWidth={stroke * 1.15}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g
        stroke={OUTLINE}
        strokeOpacity="0.55"
        strokeWidth={stroke * 0.85}
        strokeLinecap="round"
        fill="none"
      >
        {t.wrinkles.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <g transform={`translate(${t.tip[0]} ${t.tip[1]}) rotate(${t.tipAngle})`}>
        <ellipse
          cx="0"
          cy="0"
          rx="4.2"
          ry="3.4"
          fill={BODY_SHADE}
          stroke={OUTLINE}
          strokeOpacity="0.75"
          strokeWidth={stroke * 1.0}
        />
        <ellipse cx="0" cy="0.4" rx="2.6" ry="1.9" fill={OUTLINE} fillOpacity="0.14" />
        <ellipse cx="-1.3" cy="0.3" rx="0.85" ry="1.25" fill={OUTLINE} fillOpacity="0.9" />
        <ellipse cx="1.3" cy="0.3" rx="0.85" ry="1.25" fill={OUTLINE} fillOpacity="0.9" />
        <ellipse cx="-0.4" cy="-1.9" rx="1.5" ry="0.5" fill="white" fillOpacity="0.32" />
      </g>
    </g>
  );
}

function renderAccent(vibe: Vibe, stroke: number) {
  if (vibe === "going_well") {
    return (
      <g
        fill="#F4C24A"
        stroke={OUTLINE}
        strokeOpacity="0.35"
        strokeWidth={stroke * 0.5}
        className="ele-sparkles"
      >
        <Sparkle cx={16} cy={18} r={2.6} />
        <Sparkle cx={86} cy={20} r={2.2} />
      </g>
    );
  }
  if (vibe === "stuck") {
    return (
      <g
        fill="#6DA9DB"
        stroke="#3D6B9C"
        strokeWidth={stroke * 0.5}
        strokeLinejoin="round"
      >
        <path d="M 40 45 Q 38 50 40 54 Q 42 50 40 45 Z" className="ele-tear-1" />
        <path d="M 40 56 Q 38 60 40 63 Q 42 60 40 56 Z" className="ele-tear-2" />
        <path d="M 60 45 Q 58 50 60 54 Q 62 50 60 45 Z" className="ele-tear-3" />
        <path d="M 60 56 Q 58 60 60 63 Q 62 60 60 56 Z" className="ele-tear-4" />
      </g>
    );
  }
  if (vibe === "quiet_week") {
    return (
      <g
        fill="none"
        stroke={OUTLINE}
        strokeOpacity="0.55"
        strokeWidth={stroke * 1.1}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="ele-zz"
      >
        <path d="M 78 20 L 84 20 L 78 26 L 84 26" />
        <path d="M 86 14 L 90 14 L 86 18 L 90 18" />
      </g>
    );
  }
  return null;
}

function Sparkle({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const pts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.4;
    pts.push(`${cx + Math.cos(a) * rr},${cy + Math.sin(a) * rr}`);
  }
  return <polygon points={pts.join(" ")} />;
}
