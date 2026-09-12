import path from 'node:path'

export const ROLES = {
  admin: {
    email: 'e2e-admin@example.invalid',
    phone_number: process.env.SEED_ADMIN_PHONE ?? '+15555550100',
  },
  customer: { email: 'e2e-customer@example.invalid', phone_number: '+15555550101' },
} as const

export const statePath = (role: keyof typeof ROLES) =>
  path.join(process.cwd(), 'playwright', '.auth', `${role}.json`)
