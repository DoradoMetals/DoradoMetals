export function advancedCookieOptions(
  env: NodeJS.ProcessEnv = process.env
): Record<string, unknown> {
  const domain = (env.AUTH_COOKIE_DOMAIN ?? '').trim()
  if (!domain) return {}
  const base = (env.BETTER_AUTH_URL || env.FRONTEND_URL || '').trim()
  return {
    crossSubDomainCookies: { enabled: true, domain },
    ...(base ? { useSecureCookies: base.startsWith('https://') } : {}),
  }
}
