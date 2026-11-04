import { Skeleton } from "@/components/ui/skeleton"

// Route-level loading skeleton — keeps layout stable while server data loads.
export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">جارٍ التحميل — Loading</span>
      <Skeleton className="h-8 w-64 rounded-lg" />
      <Skeleton className="mt-3 h-4 w-full max-w-xl rounded" />
      <Skeleton className="mt-2 h-4 w-2/3 max-w-md rounded" />
      <div className="mt-6 space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}
