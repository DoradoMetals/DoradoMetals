export const REQUIRED_ENV_NAMES = [
  'DATABASE_URL',
  'PAYOUT_ENCRYPTION_KEY',
  'BETTER_AUTH_SECRET',
  'FRONTEND_URL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_PLACES_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'SPOT_API_URL',
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'S3_BUCKET',
  'FEDEX_CLIENT_ID',
  'FEDEX_CLIENT_SECRET',
  'FEDEX_TRACKING_CLIENT_ID',
  'FEDEX_TRACKING_CLIENT_SECRET',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_API_KEY_SID',
  'TWILIO_API_KEY_SECRET',
  'TWILIO_TWIML_APP_SID',
  'TWILIO_FROM_NUMBER',
  'MOOV_PUBLIC_KEY',
  'MOOV_SECRET_KEY',
  'MOOV_ACCOUNT_ID',
  'MOOV_WALLET_PAYMENT_METHOD_ID',
  'PLAID_CLIENT_ID',
  'PLAID_SECRET',
  'PLAID_TRUIST_ACCESS_TOKEN',
]

export const PRODUCTION_ONLY_ENV_NAMES = [
  'TURNSTILE_SECRET_KEY',
  'RESEND_FROM_DOMAIN',
  'EMAIL_FROM',
]

export function missingEnvNames(env: NodeJS.ProcessEnv = process.env): string[] {
  const required =
    env.NODE_ENV === 'production'
      ? [...REQUIRED_ENV_NAMES, ...PRODUCTION_ONLY_ENV_NAMES]
      : REQUIRED_ENV_NAMES
  return required.filter((name) => !env[name])
}

export function validateEnv(env: NodeJS.ProcessEnv = process.env): void {
  const missing = missingEnvNames(env)
  if (missing.length === 0) return
  console.error(
    `Refusing to start: missing required environment variable(s): ${missing.join(', ')}`
  )
  process.exit(1)
}
