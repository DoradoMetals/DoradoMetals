type RouteConfig = {
  path: string
  roles: string[]
  seoIndex: boolean
}

export const protectedRoutes: Record<string, RouteConfig> = {
  signIn: { path: '/auth/sign-in', roles: [], seoIndex: false },
  signInPhone: { path: '/auth/sign-in/phone', roles: [], seoIndex: false },
  signUp: { path: '/auth/sign-up', roles: [], seoIndex: false },
  verify: { path: '/auth/verify', roles: [], seoIndex: false },
  verifyStepUp: { path: '/auth/verify/step-up', roles: ['user', 'admin'], seoIndex: false },
  locked: { path: '/auth/locked', roles: [], seoIndex: false },
  sessionExpired: { path: '/auth/session-expired', roles: [], seoIndex: false },
  settingsEmail: { path: '/settings/email', roles: ['user', 'admin'], seoIndex: false },
  settingsEmailConfirmed: {
    path: '/settings/email/confirmed',
    roles: ['user', 'admin'],
    seoIndex: false,
  },
  settingsPhone: { path: '/settings/phone', roles: ['user', 'admin'], seoIndex: false },
  settingsPhoneConfirmed: {
    path: '/settings/phone/confirmed',
    roles: ['user', 'admin'],
    seoIndex: false,
  },
  admin: { path: '/admin', roles: ['admin'], seoIndex: false },
  adminOrder: { path: '/admin/orders', roles: ['admin'], seoIndex: false },
  adminRefining: { path: '/admin/refining', roles: ['admin'], seoIndex: false },
}

type R = (typeof protectedRoutes)[keyof typeof protectedRoutes]

export const isPublic = (r: R) => r.roles.length === 0 || r.roles.every((role) => !role?.trim?.())

export const shouldIndex = (r: R) => isPublic(r) && r.seoIndex
export const shouldDisallow = (r: R) => !shouldIndex(r)

export const nonIndexablePaths = () =>
  Object.values(protectedRoutes)
    .filter(shouldDisallow)
    .map((r) => r.path)
