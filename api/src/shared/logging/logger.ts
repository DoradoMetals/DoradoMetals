import pino from 'pino'

const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info')

const SECRETS = [
  'routing_number',
  'account_number',
  'access_token',
  'public_token',
  'provider_token_encrypted',
  'processor_token',
]

export const REDACT = {
  paths: [
    'req.headers.authorization',
    'req.headers.cookie',
    "req.headers['set-cookie']",
    ...SECRETS,
    ...SECRETS.map((key) => `*.${key}`),
  ],
  censor: '[REDACTED]',
}

export const logger = pino({
  level,
  redact: REDACT,
  ...(process.env.NODE_ENV !== 'production' && process.stdout.isTTY
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss' },
        },
      }
    : {}),
})
