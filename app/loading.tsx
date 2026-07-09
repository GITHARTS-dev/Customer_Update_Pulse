import { Sidebar } from "@/components/Sidebar";

export default function Loading() {
  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <Sidebar activePath="/" />
      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 flex flex-col gap-4 min-w-0 animate-pulse">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 lg:gap-6">
          <div className="h-8 w-64 bg-sand-200 rounded-lg" />
          <div className="w-full lg:w-[480px] h-16 bg-sand-100 rounded-card" />
        </div>
        <div className="h-32 bg-sand-100 rounded-card" />
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3 flex flex-col gap-4">
            <div className="h-24 bg-sand-100 rounded-card" />
            <div className="h-64 bg-sand-100 rounded-card" />
          </div>
          <div className="lg:col-span-2 flex flex-col gap-4">
            <div className="h-32 bg-sand-100 rounded-card" />
            <div className="h-64 bg-sand-100 rounded-card" />
          </div>
        </div>
      </main>
    </div>
  );
}
