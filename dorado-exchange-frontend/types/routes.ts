export type RouteConfig = {
  path: string
  roles: string[]
  desktopLabel: string
  mobileLabel: string
  desktopDisplay: boolean
  mobileDisplay: boolean
  footerDisplay: boolean
  seoIndex: boolean
}

export const protectedRoutes: Record<string, RouteConfig> = {
  buy: {
    path: '/buy',
    roles: [],
    desktopLabel: 'Buy',
    mobileLabel: 'Buy from Us',
    desktopDisplay: true,
    mobileDisplay: true,
    footerDisplay: false,
    seoIndex: true,
  },
  sell: {
    path: '/sell',
    roles: [],
    desktopLabel: 'Sell',
    mobileLabel: 'Sell to Us',
    desktopDisplay: true,
    mobileDisplay: true,
    footerDisplay: false,
    seoIndex: true,
  },
  resources: {
    path: '/resources',
    roles: [],
    desktopLabel: 'Resources',
    mobileLabel: 'Resources',
    desktopDisplay: true,
    mobileDisplay: true,
    footerDisplay: false,
    seoIndex: true,
  },
  aboutUs: {
    path: '/about-us',
    roles: [],
    desktopLabel: 'About Us',
    mobileLabel: 'About Us',
    desktopDisplay: false,
    mobileDisplay: false,
    footerDisplay: true,
    seoIndex: true,
  },
  authentication: {
    path: '/authentication',
    roles: [],
    desktopLabel: 'Authentication',
    mobileLabel: 'Authentication',
    desktopDisplay: false,
    mobileDisplay: false,
    footerDisplay: false,
    seoIndex: true,
  },
  salesTax: {
    path: '/sales-tax',
    roles: [],
    desktopLabel: 'Sales Tax',
    mobileLabel: 'Sales Tax',
    desktopDisplay: false,
    mobileDisplay: false,
    footerDisplay: false,
    seoIndex: true,
  },
  termsAndConditions: {
    path: '/terms-and-conditions',
    roles: [],
    desktopLabel: 'Terms and Conditions',
    mobileLabel: 'Terms and Conditions',
    desktopDisplay: false,
    mobileDisplay: false,
    footerDisplay: false,
    seoIndex: true,
  },
  privacyPolicy: {
    path: '/privacy-policy',
    roles: [],
    desktopLabel: 'Privacy Policy',
    mobileLabel: 'Privacy Policy',
    desktopDisplay: false,
    mobileDisplay: false,
    footerDisplay: false,
    seoIndex: true,
  },
  admin: {
    path: '/admin',
    roles: ['admin'],
    desktopLabel: 'Admin',
    mobileLabel: 'Admin',
    desktopDisplay: true,
    mobileDisplay: true,
    footerDisplay: false,
    seoIndex: false,
  },
  account: {
    path: '/account',
    roles: ['user', 'admin'],
    desktopLabel: 'Account',
    mobileLabel: 'Account',
    desktopDisplay: false,
    mobileDisplay: false,
    footerDisplay: false,
    seoIndex: false,
  },
  orders: {
    path: '/orders',
    roles: ['user', 'admin'],
    desktopLabel: 'Orders',
    mobileLabel: 'Orders',
    desktopDisplay: false,
    mobileDisplay: false,
    footerDisplay: false,
    seoIndex: false,
  },
  changeEmail: {
    path: '/change-email',
    roles: ['user', 'admin'],
    desktopLabel: 'Change Email',
    mobileLabel: 'Change Email',
    desktopDisplay: false,
    mobileDisplay: false,
    footerDisplay: false,
    seoIndex: false,
  },
  changePassword: {
    path: '/change-password',
    roles: ['admin', 'user'],
    desktopLabel: 'Change Password',
    mobileLabel: 'Change Password',
    desktopDisplay: false,
    mobileDisplay: false,
    footerDisplay: false,
    seoIndex: false,
  },
  checkout: {
    path: '/checkout',
    roles: ['user', 'admin'],
    desktopLabel: 'Checkout',
    mobileLabel: 'Checkout',
    desktopDisplay: false,
    mobileDisplay: false,
    footerDisplay: false,
    seoIndex: false,
  },
  orderPlaced: {
    path: '/order-placed',
    roles: ['user', 'admin'],
    desktopLabel: 'Order Placed',
    mobileLabel: 'Order Placed',
    desktopDisplay: false,
    mobileDisplay: false,
    footerDisplay: false,
    seoIndex: false,
  },
  resetPassword: {
    path: '/reset-password',
    roles: ['user', 'admin'],
    desktopLabel: 'Reset Password',
    mobileLabel: 'Reset Password',
    desktopDisplay: false,
    mobileDisplay: false,
    footerDisplay: false,
    seoIndex: false,
  },
  salesOrderCheckout: {
    path: '/sales-order-checkout',
    roles: ['user', 'admin'],
    desktopLabel: 'Sales Order Checkout',
    mobileLabel: 'Sales Order Checkout',
    desktopDisplay: false,
    mobileDisplay: false,
    footerDisplay: false,
    seoIndex: false,
  },
  verifyEmail: {
    path: '/verify-email',
    roles: ['user', 'admin'],
    desktopLabel: 'Verify Email',
    mobileLabel: 'Verify Email',
    desktopDisplay: false,
    mobileDisplay: false,
    footerDisplay: false,
    seoIndex: false,
  },
  verifyLogin: {
    path: '/verify-login',
    roles: ['user', 'admin'],
    desktopLabel: 'Verify Login',
    mobileLabel: 'Verify Login',
    desktopDisplay: false,
    mobileDisplay: false,
    footerDisplay: false,
    seoIndex: false,
  },
  images: {
    path: '/images',
    roles: ['admin'],
    desktopLabel: 'Images',
    mobileLabel: 'Images',
    desktopDisplay: false,
    mobileDisplay: false,
    footerDisplay: false,
    seoIndex: false,
  },
}

type R = (typeof protectedRoutes)[keyof typeof protectedRoutes]

export const isPublic = (r: R) => r.roles.length === 0 || r.roles.every((role) => !role?.trim?.())

export const shouldIndex = (r: R) => isPublic(r) && r.seoIndex
export const shouldDisallow = (r: R) => !isPublic(r) || (isPublic(r) && !r.seoIndex)

export const indexablePaths = () =>
  Object.values(protectedRoutes)
    .filter(shouldIndex)
    .map((r) => r.path)

export const nonIndexablePaths = () =>
  Object.values(protectedRoutes)
    .filter(shouldDisallow)
    .map((r) => r.path)
