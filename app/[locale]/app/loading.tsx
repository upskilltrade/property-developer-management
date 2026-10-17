export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true">
      <div className="space-y-2">
        <div className="h-3 w-40 rounded bg-slate-200" />
        <div className="h-6 w-72 rounded bg-slate-200" />
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-[74px] bg-surface p-4">
            <div className="h-2.5 w-16 rounded bg-slate-200" />
            <div className="mt-3 h-4 w-24 rounded bg-slate-200" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-line bg-surface">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex gap-4 border-b border-line px-4 py-3 last:border-0">
            <div className="h-3 w-20 rounded bg-slate-200" />
            <div className="h-3 flex-1 rounded bg-slate-100" />
            <div className="h-3 w-24 rounded bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
