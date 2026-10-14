import type { BetterAuthOptions } from 'better-auth'

export function advancedCookieOptions(
  env: NodeJS.ProcessEnv = process.env
): NonNullable<BetterAuthOptions['advanced']> {
  const domain = (env.AUTH_COOKIE_DOMAIN ?? '').trim()
  if (!domain) return {}
  const base = (env.BETTER_AUTH_URL || env.FRONTEND_URL || '').trim()
  return {
    crossSubDomainCookies: { enabled: true, domain },
    ...(base ? { useSecureCookies: base.startsWith('https://') } : {}),
  }
}
