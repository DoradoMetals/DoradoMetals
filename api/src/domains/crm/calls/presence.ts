// Admin presence for the ring path, held in process memory rather than a
// table (no migration in this pass - see the lane report for the tradeoff:
// this does not survive a restart and does not see admins on another API
// instance, and a `crm.presence` table is the fix once someone adds the
// migration). Chosen over polling Twilio's client status so the ring path
// costs one less round trip and does not depend on an external read while a
// customer waits.

const STALE_MS = 45_000

const lastSeen = new Map<string, number>()

export function markOnline(employee_id: string): void {
  lastSeen.set(employee_id, Date.now())
}

export function markOffline(employee_id: string): void {
  lastSeen.delete(employee_id)
}

export function onlineEmployeeIds(): string[] {
  const now = Date.now()
  const ids: string[] = []
  for (const [id, seen] of lastSeen) {
    if (now - seen <= STALE_MS) ids.push(id)
  }
  return ids
}

export function reset(): void {
  lastSeen.clear()
}
