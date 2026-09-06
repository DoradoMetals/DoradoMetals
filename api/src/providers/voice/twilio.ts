import crypto from 'node:crypto'
import { requiredEnv } from '#shared/env/required.ts'
import * as signature from '#providers/sms/signature.ts'

export type VoiceCredentials = {
  account_sid: string
  api_key_sid: string
  api_key_secret: string
  twiml_app_sid: string
}

const REQUIRED = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_API_KEY_SID',
  'TWILIO_API_KEY_SECRET',
  'TWILIO_TWIML_APP_SID',
] as const

const TOKEN_TTL_SECONDS = 600

export function credentials(): VoiceCredentials {
  const missing = REQUIRED.filter((name) => !(process.env[name] ?? '').trim())
  if (missing.length > 0) {
    throw new Error(
      `the Twilio Voice adapter cannot start: ${missing.join(', ')} ${
        missing.length === 1 ? 'is' : 'are'
      } not set`
    )
  }
  return {
    account_sid: (process.env.TWILIO_ACCOUNT_SID as string).trim(),
    api_key_sid: (process.env.TWILIO_API_KEY_SID as string).trim(),
    api_key_secret: (process.env.TWILIO_API_KEY_SECRET as string).trim(),
    twiml_app_sid: (process.env.TWILIO_TWIML_APP_SID as string).trim(),
  }
}

export function accessToken(identity: string): string {
  const keys = credentials()
  const issued = Math.floor(Date.now() / 1000)

  const header = { typ: 'JWT', alg: 'HS256', cty: 'twilio-fpa;v=1' }
  const claims = {
    jti: `${keys.api_key_sid}-${issued}`,
    iss: keys.api_key_sid,
    sub: keys.account_sid,
    iat: issued,
    exp: issued + TOKEN_TTL_SECONDS,
    grants: {
      identity,
      voice: {
        outgoing: { application_sid: keys.twiml_app_sid },
        incoming: { allow: true },
      },
    },
  }

  const signed = `${segment(header)}.${segment(claims)}`
  const mac = crypto
    .createHmac('sha256', keys.api_key_secret)
    .update(signed)
    .digest('base64url')
  return `${signed}.${mac}`
}

export function verifySignature(
  url: string,
  params: Record<string, string>,
  header: string
): boolean {
  return signature.verify(url, params, header, requiredEnv('TWILIO_AUTH_TOKEN'))
}

const DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>'

export function emptyResponse(): string {
  return `${DECLARATION}<Response/>`
}

export function dialNumber(to: string, callerId: string): string {
  return (
    `${DECLARATION}<Response><Dial callerId="${escape(callerId)}">` +
    `<Number>${escape(to)}</Number></Dial></Response>`
  )
}

export function dialClients(
  identities: string[],
  timeoutSeconds: number,
  actionUrl: string
): string {
  const clients = identities.map((identity) => `<Client>${escape(identity)}</Client>`).join('')
  return (
    `${DECLARATION}<Response><Dial timeout="${Math.trunc(timeoutSeconds)}" ` +
    `action="${escape(actionUrl)}">${clients}</Dial></Response>`
  )
}

export function recordVoicemail(actionUrl: string, transcribeCallbackUrl: string): string {
  return (
    `${DECLARATION}<Response><Record action="${escape(actionUrl)}" transcribe="true" ` +
    `transcribeCallback="${escape(transcribeCallbackUrl)}" playBeep="true" ` +
    `maxLength="120"/></Response>`
  )
}

function segment(value: object): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
