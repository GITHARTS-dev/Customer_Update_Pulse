import { Sidebar } from "@/components/Sidebar";
import { KpiSkeleton, HeroBoardSkeleton, AttentionSkeleton } from "@/components/Skeletons";

// Shown instantly on client navigation to a customer's pulse. Real sidebar
// frame + a skeleton header/content, so the swap into the page is seamless.
export default function Loading() {
  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <Sidebar />
      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 flex flex-col gap-4 min-w-0">
        <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 lg:gap-6">
          <div>
            <div className="h-8 w-64 max-w-full bg-sand-200 rounded-lg animate-pulse" />
            <div className="mt-3 h-3 w-72 max-w-full bg-sand-100 rounded animate-pulse" />
          </div>
          <div className="w-full lg:w-[480px] lg:shrink-0">
            <KpiSkeleton />
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
          <div className="lg:col-span-3 flex flex-col gap-4">
            <HeroBoardSkeleton />
          </div>
          <div className="lg:col-span-2 flex flex-col gap-4">
            <AttentionSkeleton />
          </div>
        </div>
      </main>
    </div>
  );
}
