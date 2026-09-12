// THE ROUTE TABLE, AFTER THE NUKE (ruling 99).
//
// This used to carry twenty-odd entries and eight fields each, because it fed
// three consumers at once: the desktop nav, the mobile sidebar and the footer
// all read their labels and their visibility out of it, and `sitemap.ts` read
// which paths to publish. All four are deleted. What is left reads two fields
// from two consumers:
//
//   - `roles`, by `ProtectedPage` on the two `/settings` change screens.
//   - `seoIndex`, by `app/robots.ts`, which disallows every path that is not
//     indexable.
//
// EVERY ROUTE HERE IS BEHIND A SIGN-IN, AND NONE OF THEM IS INDEXABLE. A
// sign-in panel is not a landing page and a verification screen is a dead end
// to a crawler, so `robots.ts` keeps the whole surface out of the index and
// only `/` is left to allow. The labels and the display flags come back with
// the nav, when there is something to navigate to.
type RouteConfig = {
  path: string
  roles: string[]
  seoIndex: boolean
}

export const protectedRoutes: Record<string, RouteConfig> = {
  signIn: { path: '/auth/sign-in', roles: [], seoIndex: false },
  signInEmail: { path: '/auth/sign-in/email', roles: [], seoIndex: false },
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
