import { SunRays } from "./SunRays";
import type { Programme } from "@/lib/types";

/**
 * Content-area placeholders. These deliberately render ONLY where API data
 * goes - the page shell (sidebar, header, section headings, card frames) is
 * always painted instantly by the page itself; these fill the holes while
 * SharePoint / Claude are still being read, so a navigation never shows a
 * blank white page. Shapes and heights mirror the real cards to avoid layout
 * shift when the content streams in.
 */

/** The three KPI tiles at the top-right of the pulse page. */
export function KpiSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="card px-3 sm:px-4 py-2.5 sm:py-3 min-w-0">
          <div className="h-2.5 w-16 max-w-full bg-sand-200 rounded animate-pulse" />
          <div className="mt-2.5 h-6 w-10 bg-sand-100 rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}

/** The mood hero band + the "Programmes, by feeling" shelves beneath it. */
export function HeroBoardSkeleton() {
  return (
    <>
      <section className="rounded-card bg-gradient-to-br from-[#191627] via-[#241C46] to-[#3A2A6B] shadow-hero px-5 sm:px-7 py-5 sm:py-6 flex flex-col sm:flex-row items-center gap-4 sm:gap-6 relative overflow-hidden">
        <SunRays className="w-[900px] h-[900px] -top-[450px] -right-[450px]" />
        <div className="shrink-0 w-[110px] h-[110px] rounded-full bg-cream/10 animate-pulse" />
        <div className="flex-1 min-w-0 w-full">
          <div className="h-2 w-24 bg-cream/15 rounded animate-pulse" />
          <div className="mt-3 h-5 w-3/4 bg-cream/15 rounded animate-pulse" />
          <div className="mt-2.5 h-3 w-1/2 bg-cream/10 rounded animate-pulse" />
        </div>
      </section>

      <section className="flex flex-col">
        {/* Same heading the real board uses - a different one here would flash
            and swap as the content streams in. */}
        <div className="flex items-baseline justify-between mb-2.5">
          <h2 className="font-serif text-xl text-ink-900">Weekly Programme Health</h2>
        </div>
        <div className="flex flex-col gap-3.5">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-card border border-sand-200 bg-sand-50 h-[104px] animate-pulse"
            />
          ))}
        </div>
      </section>
    </>
  );
}

/** The "Key Discussion Points" rail on the right of the pulse page. */
export function AttentionSkeleton() {
  return (
    <section className="card px-6 py-5 h-full flex flex-col">
      <div className="flex items-baseline justify-between">
        <h3 className="font-serif text-xl text-ink-900">Key Discussion Points</h3>
      </div>
      <div className="mt-4 space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <div className="h-2.5 w-20 bg-sand-200 rounded animate-pulse" />
            <div className="mt-2 h-3 w-full bg-sand-100 rounded animate-pulse" />
            <div className="mt-1.5 h-3 w-4/5 bg-sand-100 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </section>
  );
}

/** The "Delivery in Jira" card while the live board is fetched on render. */
export function JiraCardSkeleton() {
  return (
    <section className="card px-5 py-5">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-serif text-lg text-ink-900">Delivery in Jira</h3>
        <div className="h-2.5 w-12 bg-sand-200 rounded animate-pulse" />
      </div>
      <div className="h-8 w-20 bg-sand-100 rounded animate-pulse mb-2.5" />
      <div className="h-2 w-full bg-sand-100 rounded-full animate-pulse" />
      <div className="mt-3 flex gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-3 w-16 bg-sand-100 rounded animate-pulse" />
        ))}
      </div>
    </section>
  );
}

/**
 * The whole body of a programme page while its check-in is read. When the
 * programme is known (the in-page shell), the real name is shown at once in
 * the hero; the route-level loading.tsx has no params, so it renders a name
 * placeholder instead.
 */
export function ProgrammeBodySkeleton({ programme }: { programme?: Programme }) {
  return (
    <>
      <section className="rounded-card bg-gradient-to-br from-[#191627] via-[#241C46] to-[#3A2A6B] text-cream shadow-hero px-5 sm:px-7 py-5 sm:py-6 relative overflow-hidden">
        <SunRays className="w-[1400px] h-[1400px] -top-[700px] -right-[700px]" />
        <div className="relative flex flex-col sm:flex-row items-center gap-4 sm:gap-7 text-center sm:text-left">
          <div className="shrink-0 w-[110px] h-[110px] rounded-full bg-cream/10 animate-pulse" />
          <div className="flex-1 min-w-0 w-full">
            <p className="text-[10px] tracking-[0.18em] uppercase text-cream/55 mb-1">
              Programme
            </p>
            {programme ? (
              <h1 className="font-serif text-2xl sm:text-3xl leading-tight">
                {programme.name}
              </h1>
            ) : (
              <div className="h-7 w-52 bg-cream/15 rounded animate-pulse mx-auto sm:mx-0" />
            )}
            <div className="mt-3 h-3 w-48 bg-cream/15 rounded animate-pulse mx-auto sm:mx-0" />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
        <div className="lg:col-span-3 flex flex-col gap-4">
          <div className="rounded-card border border-sand-200 bg-sand-50 h-32 animate-pulse" />
          <div className="rounded-card border border-sand-200 bg-sand-50 h-48 animate-pulse" />
          <div className="rounded-card border border-sand-200 bg-sand-50 h-28 animate-pulse" />
        </div>
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="rounded-card border border-sand-200 bg-sand-50 h-40 animate-pulse" />
          <div className="rounded-card border border-sand-200 bg-sand-50 h-32 animate-pulse" />
        </div>
      </div>
    </>
  );
}
