type EnsureSession = () => Promise<unknown>

let ensure: EnsureSession | null = null
let known = false
let inFlight: Promise<unknown> | null = null

export function configureSession(fn: EnsureSession): void {
  ensure = fn
  known = false
  inFlight = null
}

export function forgetSession(): void {
  known = false
  inFlight = null
}

export async function ensureSession(): Promise<void> {
  if (known || !ensure) return
  if (!inFlight) {
    inFlight = ensure()
      .then((result) => {
        known = true
        return result
      })
      .finally(() => {
        inFlight = null
      })
  }
  await inFlight
}
