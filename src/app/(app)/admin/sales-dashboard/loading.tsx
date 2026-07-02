export default function SalesDashboardLoading() {
  return (
    <div className="bg-background min-h-full text-foreground">
      {/* Filter bar skeleton */}
      <div className="sticky top-0 z-30 border-b border bg-background/95 px-6 py-3 flex items-center gap-4 flex-wrap">
        <div className="h-7 w-40 rounded bg-muted animate-pulse" />
        <div className="flex gap-2 flex-wrap">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-6 w-14 rounded bg-muted animate-pulse" />
          ))}
        </div>
        <div className="flex gap-1 ml-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-7 w-20 rounded bg-muted animate-pulse" />
          ))}
        </div>
      </div>

      <div className="px-6 py-8 max-w-[1400px] mx-auto space-y-12">
        {/* Section 1 — Revenue Overview */}
        <div className="space-y-4">
          <div className="h-5 w-52 rounded bg-muted animate-pulse" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl border border bg-white animate-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 h-60 rounded-xl border border bg-white animate-pulse" />
            <div className="h-60 rounded-xl border border bg-white animate-pulse" />
          </div>
          <div className="h-36 rounded-xl border border bg-white animate-pulse" />
        </div>

        {/* SKU table placeholder */}
        <div className="space-y-3">
          <div className="h-5 w-48 rounded bg-muted animate-pulse" />
          <div className="h-80 rounded-xl border border bg-white animate-pulse" />
        </div>

        {/* Wholesale section */}
        <div className="space-y-4">
          <div className="h-5 w-52 rounded bg-muted animate-pulse" />
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl border border bg-white animate-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 h-56 rounded-xl border border bg-white animate-pulse" />
            <div className="h-56 rounded-xl border border bg-white animate-pulse" />
          </div>
        </div>

        {/* Remaining sections */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <div className="h-5 w-44 rounded bg-muted animate-pulse" />
            <div className="h-64 rounded-xl border border bg-white animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
