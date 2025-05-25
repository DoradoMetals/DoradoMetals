export default function ShellSkeleton() {
  return (
    <div className="sticky top-0 z-50 mb-6 shadow-lg bg-card w-full">
      {/* 🟡 Spots Bar Skeleton */}
      <div className="w-full bg-background py-2 px-4 sm:px-32 flex gap-6 overflow-x-auto animate-pulse">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex w-full gap-1 justify-between">
            {/* <div className="h-4 w-12 bg-muted rounded" /> */}
            <div className="h-4 w-16 bg-muted rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
