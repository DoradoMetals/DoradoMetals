import * as fake from '#providers/resend/fake.ts'
import * as resend from '#providers/resend/resend.ts'
import { isTestRun } from '#shared/testing/is-test-run.ts'
import {
  ID_HEADER,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  eventFrom,
  verify as verifySvix,
} from '#providers/resend/resend-webhook.ts'
import type { Message, Transport } from '#providers/resend/types.ts'

export type { Attachment, Message, MessageTag, Transport } from '#providers/resend/types.ts'
export type { ResendEvent, ResendEventOutcome } from '#providers/resend/resend-webhook.ts'
export { ID_HEADER, SIGNATURE_HEADER, TIMESTAMP_HEADER, eventFrom }

export type EmailProvider = 'resend' | 'fake'

export function selected(): EmailProvider {
  if (isTestRun()) return 'fake'
  if (resend.configured()) return 'resend'
  return 'fake'
}

export function isFake(): boolean {
  return selected() === 'fake'
}

export function verifyWebhook(
  body: string,
  id: string | undefined,
  timestamp: string | undefined,
  signature: string | undefined
): boolean {
  return verifySvix(process.env.RESEND_WEBHOOK_SECRET ?? '', body, id, timestamp, signature)
}

let shared: Transport | null = null
let sharedFor: EmailProvider | null = null

function sharedTransport(): Transport {
  const choice = selected()
  if (choice === 'fake') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'refusing to use the email fake in production. Set RESEND_API_KEY (with ' +
          'RESEND_FROM_DOMAIN) so real mail can be sent - a production process ' +
          'must never fake a send.'
      )
    }
    return fake.transport()
  }
  if (shared && sharedFor === choice) return shared
  shared = resend.transport()
  sharedFor = choice
  return shared
}

export async function sendEmail(
  { to, subject, text, html, attachments = [], tags = [] }: Message,
  transport?: Transport
) {
  return await (transport ?? sharedTransport()).sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    text,
    html,
    attachments,
    tags,
  })
}

export type Delivery = { sent: true; result: unknown } | { sent: false; error: string }

export async function deliver(message: Message, transport?: Transport): Promise<Delivery> {
  try {
    return { sent: true, result: await sendEmail(message, transport) }
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) }
  }
}
