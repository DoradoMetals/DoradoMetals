import * as fake from '#providers/sms/fake.ts'
import * as twilio from '#providers/sms/twilio.ts'
import type {
  SmsInbound,
  SmsMedia,
  SmsProvider,
  SmsSendResult,
  SmsStatusUpdate,
  TwilioForm,
} from '#providers/sms/types.ts'

export type {
  SmsInbound,
  SmsMedia,
  SmsProvider,
  SmsSendResult,
  SmsStatusUpdate,
  TwilioForm,
} from '#providers/sms/types.ts'

export function isFake(): boolean {
  return (process.env.SMS_PROVIDER ?? 'fake') !== 'twilio'
}

function provider(): SmsProvider {
  return isFake() ? fake : twilio
}

export function send(to: string, body: string, media?: SmsMedia[]): Promise<SmsSendResult> {
  return provider().send(to, body, media)
}

export function verifySignature(
  url: string,
  params: Record<string, string>,
  header: string
): boolean {
  return provider().verifySignature(url, params, header)
}

export function parseInbound(form: TwilioForm): SmsInbound {
  return provider().parseInbound(form)
}

export function parseStatus(form: TwilioForm): SmsStatusUpdate {
  return provider().parseStatus(form)
}
