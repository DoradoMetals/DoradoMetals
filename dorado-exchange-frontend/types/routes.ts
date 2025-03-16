// config/routes.ts
export const protectedRoutes = {
  account: { path: "/account", roles: ["user"]},
  changeEmail: { path: "/change-email", roles: ["user"]},
  verifyEmail: { path: "/verify-email", roles: ["user"]},
  resetPassword: { path: "/reset-password", roles: ["user"]},
};
