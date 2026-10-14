import type { SmsMedia, SmsSendResult } from '#providers/twilio/types.ts'

export { parseInbound, parseStatus } from '#providers/twilio/sms.ts'

export type FakeMessage = {
  to: string
  from: string
  body: string
  media: SmsMedia[]
  provider_sid: string
  sent_at: string
}

const MAX_MESSAGES = 500
const FALLBACK_FROM = '+15550100000'

const messages: FakeMessage[] = []
let counter = 0

const digits = (value: string): string => value.replace(/\D/g, '')

export async function send(
  to: string,
  body: string,
  media: SmsMedia[] = []
): Promise<SmsSendResult> {
  counter += 1
  const message: FakeMessage = {
    to,
    from: (process.env.TWILIO_FROM_NUMBER ?? '').trim() || FALLBACK_FROM,
    body,
    media,
    provider_sid: `SMfake${String(counter).padStart(26, '0')}`,
    sent_at: new Date().toISOString(),
  }
  messages.push(message)
  if (messages.length > MAX_MESSAGES) messages.splice(0, messages.length - MAX_MESSAGES)
  return { provider_sid: message.provider_sid, status: 'queued', error_code: null }
}

export function lastMessageTo(number: string): FakeMessage | null {
  const wanted = digits(number)
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (digits(messages[index].to) === wanted) return messages[index]
  }
  return null
}

export function lastCodeTo(number: string): string | null {
  const message = lastMessageTo(number)
  if (!message) return null
  const found = message.body.match(/(?<!\d)(\d{6})(?!\d)/)
  return found ? found[1] : null
}

export function sent(): readonly FakeMessage[] {
  return messages
}

export function byMessageId(provider_sid: string): FakeMessage | null {
  return messages.find((message) => message.provider_sid === provider_sid) ?? null
}

export function reset(): void {
  messages.length = 0
  counter = 0
}

export function verifySignature(): boolean {
  return true
}
