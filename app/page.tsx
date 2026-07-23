import Image from "next/image";
import Link from "next/link";
import { primaryCustomer } from "@/lib/customers";
import { ProfileBadge } from "@/components/ProfileBadge";

/** The HARTS heart-cluster rainbow - same brand thread used in the sidebar. */
const RAINBOW =
  "linear-gradient(90deg, #D6473F 0%, #E8A020 28%, #3BA46A 55%, #3E8FCF 78%, #6C47E8 100%)";

/**
 * The HARTS launchpad - the platform's front door. Kept a static server page
 * (no server-side session read) so Azure SWA serves it instantly and it can
 * never repeat the dynamic-root redirect loop this app hit earlier - the
 * signed-in user's name is fetched client-side instead, in ProfileBadge.
 */
export default function Launchpad() {
  return (
    <main className="relative h-screen overflow-hidden bg-cream px-5 py-8 flex flex-col items-center justify-center">
      {/* Ambient brand glow - echoes each workspace's accent, kept faint. Its
          own clipped layer so it can never affect the fixed corner badges. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div
          className="absolute -top-40 left-1/2 -translate-x-[65%] h-[26rem] w-[26rem] rounded-full blur-[110px]"
          style={{ backgroundColor: "rgba(108, 71, 232, 0.12)" }}
        />
        <div
          className="absolute top-16 left-1/2 translate-x-[15%] h-[24rem] w-[24rem] rounded-full blur-[110px]"
          style={{ backgroundColor: "rgba(47, 127, 184, 0.10)" }}
        />
      </div>

      {/* Corner badges - logo left, account right. Fixed so they hold their
          spot regardless of how tall the centered content below happens to be. */}
      <div className="fixed top-4 left-4 sm:top-6 sm:left-6 z-20 flex items-center rounded-full border border-sand-200 bg-cream/90 backdrop-blur px-4 py-2.5 shadow-card">
        <Image
          src="/logos/harts_logo.png"
          alt="HARTS Consulting"
          width={278}
          height={98}
          className="h-9 w-auto sm:h-10"
          priority
        />
      </div>
      <ProfileBadge />

      <div className="relative w-full max-w-3xl flex flex-col items-center">
        <div className="flex items-center gap-2.5">
          <span className="h-px w-7" style={{ background: RAINBOW, opacity: 0.6 }} />
          <span className="text-[10px] tracking-[0.28em] uppercase text-ink-400 font-semibold">
            Launchpad
          </span>
          <span className="h-px w-7" style={{ background: RAINBOW, opacity: 0.6 }} />
        </div>

        <h1 className="mt-4 font-serif text-3xl sm:text-4xl tracking-tight text-ink-900 text-center">
          Welcome to HARTS
        </h1>
        <p className="mt-3 text-[15px] text-ink-500 text-center">
          Choose a workspace to open.
        </p>

        <div className="mt-10 w-full grid gap-5 sm:grid-cols-2">
          <AppTile
            href={`/c/${primaryCustomer().id}`}
            internal
            accent="#6C47E8"
            accentSoft="#9B82F2"
            title="Customer Update Pulse"
            description="A sentiment-led view of HARTS' customer transformation programmes."
            tag="Qualitative Dashboard"
            icon={<PulseIcon />}
          />
          <AppTile
            href="/invoice"
            accent="#2F7FB8"
            accentSoft="#6BB3DE"
            title="Customer Engagement Health"
            description="The monthly customer invoice workbook, read live from SharePoint."
            tag="Quantitative Dashboard"
            icon={<InvoiceIcon />}
          />
        </div>

        <div className="mt-10 flex items-center gap-3">
          <span className="h-px w-10 bg-sand-300" />
          <p className="text-xs text-ink-400">HARTS Consulting · Internal Tools</p>
          <span className="h-px w-10 bg-sand-300" />
        </div>
      </div>
    </main>
  );
}

function AppTile({
  href,
  internal = false,
  accent,
  accentSoft,
  title,
  description,
  tag,
  icon
}: {
  href: string;
  internal?: boolean;
  accent: string;
  accentSoft: string;
  title: string;
  description: string;
  tag: string;
  icon: React.ReactNode;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <span
          className="inline-flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-md transition-transform duration-200 group-hover:scale-105"
          style={{ background: `linear-gradient(135deg, ${accentSoft}, ${accent})` }}
        >
          {icon}
        </span>
        <span
          className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]"
          style={{ color: accent, backgroundColor: `${accent}1A` }}
        >
          {tag}
        </span>
      </div>
      <h2 className="mt-5 font-serif text-xl text-ink-900">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-500">{description}</p>
      <span
        className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium transition-transform group-hover:translate-x-0.5"
        style={{ color: accent }}
      >
        Open
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M5 12h14M13 6l6 6-6 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </>
  );

  const className =
    "group relative flex flex-col rounded-card border border-sand-200 bg-cream p-7 shadow-card transition-all duration-200 hover:-translate-y-1 hover:border-sand-300 hover:shadow-hero focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";
  // Tint the focus ring with this tile's accent.
  const style = { "--tw-ring-color": accent } as React.CSSProperties;

  return internal ? (
    <Link href={href} className={className} style={style}>
      {inner}
    </Link>
  ) : (
    // Plain anchor: /invoice is the separate Vite SPA, served as static files
    // outside Next's router, so it needs a full navigation (not client routing).
    <a href={href} className={className} style={style}>
      {inner}
    </a>
  );
}

function PulseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 12h3.5l2-6 3.5 12 2.5-8 1.5 2H21"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function InvoiceIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M14 3v4h4M9 12h6M9 16h6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
