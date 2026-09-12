import axios from 'axios'
import { requiredEnv } from '#shared/env/required.ts'
import * as signature from '#providers/twilio/signature.ts'
import type {
  SmsInbound,
  SmsMedia,
  SmsSendResult,
  SmsStatusUpdate,
  TwilioForm,
} from '#providers/twilio/types.ts'

export type TwilioCredentials = {
  account_sid: string
  auth_token: string
  from_number: string
}

const REQUIRED = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'] as const

export function credentials(): TwilioCredentials {
  const missing = REQUIRED.filter((name) => !(process.env[name] ?? '').trim())
  if (missing.length > 0) {
    throw new Error(
      `the Twilio SMS adapter cannot start: ${missing.join(', ')} ${
        missing.length === 1 ? 'is' : 'are'
      } not set`
    )
  }
  return {
    account_sid: (process.env.TWILIO_ACCOUNT_SID as string).trim(),
    auth_token: (process.env.TWILIO_AUTH_TOKEN as string).trim(),
    from_number: (process.env.TWILIO_FROM_NUMBER as string).trim(),
  }
}

export async function send(
  to: string,
  body: string,
  media: SmsMedia[] = []
): Promise<SmsSendResult> {
  const { account_sid, auth_token, from_number } = credentials()
  const form = new URLSearchParams()
  form.append('To', to)
  form.append('From', from_number)
  form.append('Body', body)
  for (const attachment of media) form.append('MediaUrl', attachment.url)

  const response = await axios.post(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(account_sid)}/Messages.json`,
    form,
    {
      auth: { username: account_sid, password: auth_token },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  )

  const data = (response.data ?? {}) as Record<string, unknown>
  return {
    provider_sid: text(data.sid),
    status: text(data.status),
    error_code: blankToNull(text(data.error_code)),
  }
}

export function verifySignature(
  url: string,
  params: Record<string, string>,
  header: string
): boolean {
  return signature.verify(url, params, header, requiredEnv('TWILIO_AUTH_TOKEN'))
}

export function parseInbound(form: TwilioForm): SmsInbound {
  const declared = Number(text(form.NumMedia))
  const count = Number.isFinite(declared) && declared > 0 ? Math.trunc(declared) : 0
  const media: SmsMedia[] = []
  for (let index = 0; index < count; index += 1) {
    const url = text(form[`MediaUrl${index}`])
    if (!url) continue
    media.push({ url, content_type: text(form[`MediaContentType${index}`]) })
  }
  return {
    provider_sid: text(form.MessageSid) || text(form.SmsSid),
    from_number: text(form.From),
    to_number: text(form.To),
    body: text(form.Body),
    media,
  }
}

export function parseStatus(form: TwilioForm): SmsStatusUpdate {
  return {
    provider_sid: text(form.MessageSid) || text(form.SmsSid),
    status: text(form.MessageStatus) || text(form.SmsStatus),
    error_code: blankToNull(text(form.ErrorCode)),
  }
}

function text(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return text(value[0])
  return String(value).trim()
}

function blankToNull(value: string): string | null {
  return value === '' ? null : value
}
