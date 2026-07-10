import { Sidebar } from "@/components/Sidebar";
import { ProgrammeBodySkeleton } from "@/components/Skeletons";

// Instant fallback for a programme route. No params here, so the hero shows a
// name placeholder; the page's own shell fills the real name a moment later.
export default function Loading() {
  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <Sidebar />
      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 flex flex-col gap-4 min-w-0">
        <div className="h-3 w-24 bg-sand-200 rounded animate-pulse" />
        <ProgrammeBodySkeleton />
      </main>
    </div>
  );
}
