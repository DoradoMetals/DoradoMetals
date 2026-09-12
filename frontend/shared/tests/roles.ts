import path from 'node:path'

// The seeded e2e accounts and where their sessions are saved.
//
// NOT in `auth.setup.ts`, and that is the whole point: Playwright refuses to
// let one test file import another, so the setup spec that MINTS the sessions
// and the specs that USE them cannot share a constant unless it lives outside
// both. It used to live in the setup file, which worked only while nothing
// reused it.
// The admin's number follows `SEED_ADMIN_PHONE` (api/scripts/seed-e2e-users.mjs).
// Jacob seeds his own number from his api/.env while testing on a real phone;
// with the variable unset both sides use the reserved test number.
export const ROLES = {
  admin: {
    email: 'e2e-admin@example.invalid',
    phone_number: process.env.SEED_ADMIN_PHONE ?? '+15555550100',
  },
  customer: { email: 'e2e-customer@example.invalid', phone_number: '+15555550101' },
} as const

export const statePath = (role: keyof typeof ROLES) =>
  path.join(process.cwd(), 'playwright', '.auth', `${role}.json`)
