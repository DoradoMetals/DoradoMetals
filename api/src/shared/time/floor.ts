export function padTo(startedAt: number, floorMs: number): Promise<void> {
  const remaining = Math.min(floorMs, floorMs - (Date.now() - startedAt))
  if (!(remaining > 0)) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, remaining))
}
