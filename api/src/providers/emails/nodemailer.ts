import nodemailer from 'nodemailer'
import { isTestRun } from '#shared/testing/is-test-run.ts'

export type Transport = {
  sendMail: (message: Message) => Promise<unknown>
}

export type Attachment = {
  filename: string
  content: Buffer | Uint8Array | string
  contentType?: string
}

type Message = {
  from?: string
  to?: string | null
  subject?: string
  text?: string
  html?: string
  attachments?: Attachment[]
}

let shared: Transport | null = null

function sharedTransport(): Transport {
  if (isTestRun()) {
    throw new Error(
      'refusing to build the real mail transport during a test run.\n' +
        'Pass a transport: sendEmail(message, recorder). Nothing in a test may ' +
        'reach a customer or a refiner.'
    )
  }

  if (shared) return shared

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  })

  const wrapped: Transport = {
    sendMail: (message: Message) =>
      transporter.sendMail({
        ...message,
        to: message.to ?? undefined,
        attachments: message.attachments as nodemailer.SendMailOptions['attachments'],
      }),
  }

  shared = wrapped
  return wrapped
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
