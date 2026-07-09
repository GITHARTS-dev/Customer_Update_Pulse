import { Sidebar } from "@/components/Sidebar";

export default function Loading() {
  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <Sidebar activePath="/" />
      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 flex flex-col gap-4 min-w-0 animate-pulse">
        <div className="h-4 w-24 bg-sand-200 rounded" />
        <div className="h-40 bg-sand-100 rounded-card" />
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
          <div className="lg:col-span-3 flex flex-col gap-4">
            <div className="h-32 bg-sand-100 rounded-card" />
            <div className="h-48 bg-sand-100 rounded-card" />
          </div>
          <div className="lg:col-span-2 flex flex-col gap-4">
            <div className="h-56 bg-sand-100 rounded-card" />
            <div className="h-24 bg-sand-100 rounded-card" />
            <div className="h-40 bg-sand-100 rounded-card" />
          </div>
        </div>
      </main>
    </div>
  );
}
