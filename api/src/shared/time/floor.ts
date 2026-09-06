// A constant-time floor. The caller records a start, does its work, and awaits
// this before answering, so a branch that dispatched to a provider and a branch
// that dispatched nothing both answer at the floor. The wait is capped at the
// floor itself: a clock that has moved backwards must not stall a request.
export function padTo(startedAt: number, floorMs: number): Promise<void> {
  const remaining = Math.min(floorMs, floorMs - (Date.now() - startedAt))
  if (!(remaining > 0)) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, remaining))
}
