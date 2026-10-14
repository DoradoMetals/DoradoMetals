export const SESSION_COOKIE = 'better-auth.session_token'
export const SECURE_SESSION_COOKIE = `__Secure-${SESSION_COOKIE}`
export const SESSION_COOKIE_NAMES = [SESSION_COOKIE, SECURE_SESSION_COOKIE] as const

export const PROXY_GUARDED_PREFIXES = ['/admin', '/account'] as const
