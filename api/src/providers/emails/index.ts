import * as fake from '#providers/emails/fake.ts'
import * as resend from '#providers/emails/resend.ts'
import * as smtp from '#providers/emails/nodemailer.ts'
import { isTestRun } from '#shared/testing/is-test-run.ts'
import {
  ID_HEADER,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  eventFrom,
  verify as verifySvix,
} from '#providers/emails/resend-webhook.ts'
import type { Message, Transport } from '#providers/emails/types.ts'

export type { Attachment, Message, MessageTag, Transport } from '#providers/emails/types.ts'
export type { ResendEvent, ResendEventOutcome } from '#providers/emails/resend-webhook.ts'
export { ID_HEADER, SIGNATURE_HEADER, TIMESTAMP_HEADER, eventFrom }

export type EmailProvider = 'resend' | 'smtp' | 'fake'

export function selected(): EmailProvider {
  if (isTestRun()) return 'fake'
  if (resend.configured()) return 'resend'
  if (process.env.EMAIL_HOST) return 'smtp'
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
          'RESEND_FROM_DOMAIN) or EMAIL_HOST so real mail can be sent - a production process ' +
          'must never fake a send.'
      )
    }
    return fake.transport()
  }
  if (shared && sharedFor === choice) return shared
  shared = choice === 'resend' ? resend.transport() : smtp.transport()
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

// The send, with its failure turned into a value so a caller can file the
// paper-trail row before the failure travels on. The try/catch lives here
// because ruling 52 allows none under domains/.
export type Delivery = { sent: true; result: unknown } | { sent: false; error: string }

export async function deliver(message: Message, transport?: Transport): Promise<Delivery> {
  try {
    return { sent: true, result: await sendEmail(message, transport) }
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) }
  }
}
