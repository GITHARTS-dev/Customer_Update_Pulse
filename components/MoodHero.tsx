"use client";

import { BabyElephant } from "./BabyElephant";
import { SunRays } from "./SunRays";
import { AutoTextarea, EditBadge } from "./EditableField";
import { useEditMode } from "./EditModeProvider";
import type { Vibe } from "@/lib/types";

interface MoodHeroProps {
  /** What the page shows now: the lead's override if there is one, else the computed line. */
  headline: string;
  supporting: string;
  vibe: Vibe;
  /**
   * The computed sentences, before any override. Clearing an edited field
   * falls back to these rather than publishing a blank hero.
   */
  computedHeadline: string;
  computedSupporting: string;
}

export function MoodHero({
  headline,
  supporting,
  vibe,
  computedHeadline,
  computedSupporting
}: MoodHeroProps) {
  const { editMode, portfolioDraft, setPortfolioField } = useEditMode();

  const headlineValue = portfolioDraft.headline ?? headline;
  const supportingValue = portfolioDraft.supporting ?? supporting;

  return (
    <section className="rounded-card bg-gradient-to-br from-[#191627] via-[#241C46] to-[#3A2A6B] text-cream shadow-hero px-5 sm:px-7 py-5 sm:py-6 flex flex-col sm:flex-row items-center sm:items-center gap-4 sm:gap-6 relative overflow-hidden text-center sm:text-left">
      <div className="absolute -right-12 -top-12 w-56 h-56 rounded-full bg-violet/25 blur-3xl pointer-events-none" />
      <div className="absolute -left-16 -bottom-16 w-52 h-52 rounded-full bg-[#3E8FCF]/15 blur-3xl pointer-events-none" />
      <SunRays className="w-[900px] h-[900px] -top-[450px] -right-[450px]" />
      <div className="shrink-0 relative">
        <BabyElephant vibe={vibe} size={110} animated />
      </div>
      <div className="relative min-w-0 w-full">
        <p className="text-[10px] tracking-[0.18em] uppercase text-cream/50 mb-1.5 flex items-center justify-center sm:justify-start gap-2">
          This week's pulse
          {editMode && <EditBadge tone="dark" />}
        </p>

        {editMode ? (
          <div className="space-y-2 text-left">
            <AutoTextarea
              tone="dark"
              value={headlineValue}
              ariaLabel="Pulse headline"
              placeholder={computedHeadline}
              maxLength={400}
              onChange={(v) => setPortfolioField("headline", v, headline)}
              className="font-serif text-xl sm:text-2xl leading-tight text-cream"
            />
            <AutoTextarea
              tone="dark"
              value={supportingValue}
              ariaLabel="Pulse supporting line"
              placeholder={computedSupporting}
              maxLength={400}
              onChange={(v) => setPortfolioField("supporting", v, supporting)}
              className="text-sm text-cream/70"
            />
            <p className="text-[10.5px] text-cream/45">
              Leave a line empty to go back to the sentence the dashboard works out on its own.
            </p>
          </div>
        ) : (
          <>
            <h2 className="font-serif text-xl sm:text-2xl leading-tight max-w-md mx-auto sm:mx-0">
              {headline}
            </h2>
            <p className="mt-1.5 text-sm text-cream/70 max-w-md mx-auto sm:mx-0">
              {supporting}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
