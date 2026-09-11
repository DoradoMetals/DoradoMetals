import * as fake from '#providers/emails/fake.ts'
import * as real from '#providers/emails/nodemailer.ts'
import { isTestRun } from '#shared/testing/is-test-run.ts'
import type { Message, Transport } from '#providers/emails/types.ts'

export type { Attachment, Message, Transport } from '#providers/emails/types.ts'

export function isFake(): boolean {
  return !process.env.EMAIL_HOST || isTestRun()
}

let shared: Transport | null = null

function sharedTransport(): Transport {
  if (isFake()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'refusing to use the email fake in production. Set EMAIL_HOST (and the rest of the ' +
          'SMTP env) so real mail can be sent - a production process must never fake a send.'
      )
    }
    return fake.transport()
  }
  if (shared) return shared
  shared = real.transport()
  return shared
}

export async function sendEmail(
  { to, subject, text, html, attachments = [] }: Message,
  transport?: Transport
) {
  return await (transport ?? sharedTransport()).sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    text,
    html,
    attachments,
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
