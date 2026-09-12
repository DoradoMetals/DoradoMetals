export type FakeCheck = {
  token: string
  ip: string | null
  passed: boolean
  at: string
}

const checks: FakeCheck[] = []
let verdicts: boolean[] = []

export async function verify(token: string, ip: string | null): Promise<boolean> {
  const passed = verdicts.length > 0 ? verdicts.shift()! : true
  checks.push({ token, ip, passed, at: new Date().toISOString() })
  return passed
}

export function next(...answers: boolean[]): void {
  verdicts.push(...answers)
}

export function checked(): readonly FakeCheck[] {
  return checks
}

export function lastCheck(): FakeCheck | null {
  return checks.length === 0 ? null : checks[checks.length - 1]
}

export function reset(): void {
  checks.length = 0
  verdicts = []
}
