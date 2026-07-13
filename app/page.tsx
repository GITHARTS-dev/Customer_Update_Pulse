import Image from "next/image";
import Link from "next/link";
import { primaryCustomer } from "@/lib/customers";
import { ProfileBadge } from "@/components/ProfileBadge";

/**
 * The HARTS launchpad — the platform's front door. Kept a static server page
 * (no server-side session read) so Azure SWA serves it instantly and it can
 * never repeat the dynamic-root redirect loop this app hit earlier — the
 * signed-in user's name is fetched client-side instead, in ProfileBadge.
 */
export default function Launchpad() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#F4F2FC] to-cream px-5 py-16 sm:py-20 flex flex-col items-center">
      <ProfileBadge />
      <div className="w-full max-w-3xl flex flex-col items-center">
        <Image
          src="/logos/harts_logo.png"
          alt="HARTS Consulting"
          width={278}
          height={98}
          className="h-10 w-auto"
          priority
        />
        <h1 className="mt-9 font-serif text-3xl sm:text-4xl tracking-tight text-ink-900 text-center">
          Welcome to HARTS
        </h1>
        <p className="mt-2.5 text-[15px] text-ink-500 text-center">
          Choose a workspace to open.
        </p>

        <div className="mt-11 w-full grid gap-5 sm:grid-cols-2">
          <AppTile
            href={`/c/${primaryCustomer().id}`}
            internal
            accent="#6C47E8"
            title="Customer Update Pulse"
            description="A sentiment-led view of HARTS' customer transformation programmes."
            icon={<PulseIcon />}
          />
          <AppTile
            href="/invoice"
            accent="#2F7FB8"
            title="Customer Engagement Health"
            description="The monthly customer invoice workbook, read live from SharePoint."
            icon={<InvoiceIcon />}
          />
        </div>

        <p className="mt-12 text-xs text-ink-400 text-center">
          HARTS Consulting · Internal Tools
        </p>
      </div>
    </main>
  );
}

function AppTile({
  href,
  internal = false,
  accent,
  title,
  description,
  icon
}: {
  href: string;
  internal?: boolean;
  accent: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  const inner = (
    <>
      <span
        className="inline-flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-sm"
        style={{ backgroundColor: accent }}
      >
        {icon}
      </span>
      <h2 className="mt-5 font-serif text-xl text-ink-900">{title}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{description}</p>
      <span
        className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium transition-transform group-hover:translate-x-0.5"
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
    "group flex flex-col rounded-card border border-sand-200 bg-cream p-6 shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-hero focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";
  // Tint the focus ring with this tile's accent.
  const style = { "--tw-ring-color": accent } as React.CSSProperties;

  return internal ? (
    <Link href={href} className={className} style={style}>
      {inner}
    </Link>
  ) : (
    // Plain anchor: /invoice/ is the separate Vite SPA, served as static files
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
