import type { BetterAuthOptions } from 'better-auth'

const hostOf = (value: string | undefined): string | null => {
  return value && URL.canParse(value) ? new URL(value).hostname.toLowerCase() : null
}

// The only parent domain derived on its own. Any other shared suffix (for
// example `.up.railway.app`) may be a public suffix that browsers reject.
const OUR_DOMAIN = '.doradometals.com'

// The parent domain two hosts share (`uat.x.com` + `uat-api.x.com` -> `.x.com`),
// or null for one host, an IP, or hosts with no shared registrable domain.
export function sharedParentDomain(a: string | undefined, b: string | undefined): string | null {
  const left = hostOf(a)
  const right = hostOf(b)
  if (!left || !right || left === right) return null
  if (
    /^[\d.]+$/.test(left) ||
    /^[\d.]+$/.test(right) ||
    !left.includes('.') ||
    !right.includes('.')
  )
    return null
  const l = left.split('.').reverse()
  const r = right.split('.').reverse()
  const shared: string[] = []
  for (let i = 0; i < Math.min(l.length, r.length) && l[i] === r[i]; i++) shared.push(l[i]!)
  const parent = `.${shared.reverse().join('.')}`
  return parent === OUR_DOMAIN ? parent : null
}

export function advancedCookieOptions(
  env: NodeJS.ProcessEnv = process.env
): NonNullable<BetterAuthOptions['advanced']> {
  const domain =
    (env.AUTH_COOKIE_DOMAIN ?? '').trim() ||
    sharedParentDomain(env.FRONTEND_URL, env.BETTER_AUTH_URL) ||
    ''
  if (!domain) return {}
  const base = (env.BETTER_AUTH_URL || env.FRONTEND_URL || '').trim()
  return {
    crossSubDomainCookies: { enabled: true, domain },
    ...(base ? { useSecureCookies: base.startsWith('https://') } : {}),
  }
}
