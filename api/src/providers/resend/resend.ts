import type { Attachment, Message, MessageTag, Transport } from '#providers/resend/types.ts'
import {
  RESEND_DEFAULT_HOST,
  RESEND_SEND_EMAIL_PATH,
} from '#providers/resend/constants.ts'

export type ResendAttachment = {
  filename: string
  content: string
  content_type?: string
}

export type ResendRequest = {
  from: string
  to: string[]
  subject: string
  html?: string
  text?: string
  attachments?: ResendAttachment[]
  tags?: MessageTag[]
}

export function configured(): boolean {
  return Boolean((process.env.RESEND_API_KEY ?? '').trim())
}

function domainOf(address: string): string {
  const inside = address.match(/<([^>]+)>/)
  const bare = (inside ? inside[1] : address).trim()
  return bare.slice(bare.lastIndexOf('@') + 1).toLowerCase()
}

export function assertSendable(): void {
  if (process.env.NODE_ENV !== 'production') return
  const verified = (process.env.RESEND_FROM_DOMAIN ?? '').trim().toLowerCase()
  if (!verified) {
    throw new Error(
      'refusing to send through Resend in production without RESEND_FROM_DOMAIN. Set it to the ' +
        'domain verified in the Resend dashboard, and make EMAIL_FROM an address on it.'
    )
  }
  const from = (process.env.EMAIL_FROM ?? '').trim()
  const sending = domainOf(from)
  if (!from || (sending !== verified && !sending.endsWith(`.${verified}`))) {
    throw new Error(
      `refusing to send through Resend in production: EMAIL_FROM (${from || 'unset'}) is not on ` +
        `the verified domain ${verified}`
    )
  }
}

const SAFE_TAG = /[^A-Za-z0-9_-]/g

export function tagsFor(tags: MessageTag[] = []): MessageTag[] {
  return tags.map((tag) => ({
    name: tag.name.replace(SAFE_TAG, '_'),
    value: tag.value.replace(SAFE_TAG, '_'),
  }))
}

function base64(content: Attachment['content']): string {
  if (typeof content === 'string') return Buffer.from(content, 'utf8').toString('base64')
  return Buffer.from(content).toString('base64')
}

export function requestBody(message: Message): ResendRequest {
  const body: ResendRequest = {
    from: message.from ?? '',
    to: message.to ? [message.to] : [],
    subject: message.subject ?? '',
  }
  if (message.html) body.html = message.html
  if (message.text) body.text = message.text
  if (message.attachments && message.attachments.length > 0) {
    body.attachments = message.attachments.map((attachment) => ({
      filename: attachment.filename,
      content: base64(attachment.content),
      ...(attachment.contentType ? { content_type: attachment.contentType } : {}),
    }))
  }
  const tags = tagsFor(message.tags)
  if (tags.length > 0) body.tags = tags
  return body
}

export function messageIdFrom(payload: unknown): string | null {
  const id = (payload as { id?: unknown } | null | undefined)?.id
  return typeof id === 'string' && id.length > 0 ? id : null
}

export function refusalFrom(status: number, payload: unknown): string {
  const body = (payload ?? {}) as { name?: unknown; message?: unknown }
  const name = typeof body.name === 'string' ? body.name : 'error'
  const message = typeof body.message === 'string' ? body.message : 'no message'
  return `resend refused the send: ${status} ${name} - ${message}`
}

export function transport(): Transport {
  assertSendable()
  const key = (process.env.RESEND_API_KEY ?? '').trim()
  const host = process.env.RESEND_HOST ?? RESEND_DEFAULT_HOST

  return {
    sendMail: async (message: Message) => {
      const response = await fetch(`${host}${RESEND_SEND_EMAIL_PATH}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody(message)),
      })
      const payload: unknown = await response.json().catch(() => null)
      if (!response.ok) throw new Error(refusalFrom(response.status, payload))
      const messageId = messageIdFrom(payload)
      if (!messageId) throw new Error('resend accepted the send but returned no id')
      return { messageId }
    },
  }
}
