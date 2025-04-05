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

      {/* 🟡 Navbar Skeleton */}
      <nav className="bg-card px-4 py-4 sm:px-32 animate-pulse">
        <div className="flex items-center justify-between w-full">
          {/* Left: Logo + Title */}
          <div className="flex items-center gap-4">
            {/* Logo */}
            <div className="h-8 w-8 bg-muted rounded-sm" />

            {/* Title */}
            <div className="h-6 w-48 bg-muted rounded-sm hidden sm:block" />
          </div>

          {/* Middle: Desktop nav links */}
          <div className="hidden lg:flex items-center gap-8">
            <div className="h-4 w-10 bg-muted rounded-sm" />
            <div className="h-4 w-10 bg-muted rounded-sm" />
          </div>

          {/* Right: Icons */}
          <div className="flex items-center gap-6">
            <div className="h-6 w-6 bg-muted rounded-full" /> {/* Cart */}
            <div className="h-6 w-6 bg-muted rounded-full" /> {/* Profile */}
          </div>
        </div>
      </nav>
    </div>
  )
}