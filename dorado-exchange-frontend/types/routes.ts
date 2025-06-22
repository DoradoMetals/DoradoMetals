export const protectedRoutes = {
  account: { path: '/account', roles: ['user', 'admin'] },
  changeEmail: { path: '/change-email', roles: ['user', 'admin'] },
  verifyEmail: { path: '/verify-email', roles: ['user', 'admin'] },
  resetPassword: { path: '/reset-password', roles: ['user', 'admin'] },
  verifyLogin: { path: '/verify-login', roles: ['user', 'admin'] },
  admin: { path: '/admin', roles: ['admin'] },
  checkout: { path: '/checkout', roles: ['user', 'admin'] },
  salesOrderCheckout: { path: 'sales-order-checkout', roles: ['user', 'admin'] },
}
