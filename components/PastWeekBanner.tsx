import Link from "next/link";

/**
 * The standing reminder that nothing on screen is current.
 *
 * A checkpoint reuses the live layout, so without this the same page would read
 * as this week's truth - a CEO could act on a month-old ask. It is amber (the
 * app's existing "stale" tone, not an error red - old data isn't a fault), it
 * says the week AND its dates, and it keeps one obvious way back.
 */
export function PastWeekBanner({
  week,
  range,
  backHref,
  /** Programmes that checked in that week, out of the total then tracked. */
  checkedIn,
  total
}: {
  week: number;
  range: string;
  backHref: string;
  checkedIn: number;
  total: number;
}) {
  return (
    <div className="rounded-card border border-[#E8C685] bg-[#F8E7CC] px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex items-start gap-3 min-w-0">
        <span
          className="mt-0.5 inline-flex w-7 h-7 shrink-0 items-center justify-center rounded-full bg-[#7A4A0E]/10 text-[#7A4A0E]"
          aria-hidden
        >
          <svg
            viewBox="0 0 24 24"
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 8v4l3 2" />
            <path d="M3.05 11a9 9 0 1 1 .5 4" />
            <path d="M3 4v5h5" />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[#7A4A0E] leading-tight">
            You're looking at week {week} · {range}
          </p>
          <p className="text-[11.5px] text-[#7A4A0E]/80 leading-tight mt-0.5">
            A saved checkpoint, not this week. {checkedIn} of {total}{" "}
            {total === 1 ? "programme" : "programmes"} had checked in. Editing is off here.
          </p>
        </div>
      </div>
      <Link
        href={backHref}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-[#7A4A0E] px-3.5 py-1.5 text-[11.5px] font-medium text-[#F8E7CC] hover:bg-[#653C09] transition"
      >
        Back to this week
        <span aria-hidden>→</span>
      </Link>
    </div>
  );
}
