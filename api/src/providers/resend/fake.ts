import type { Message, Transport } from '#providers/resend/types.ts'

export type FakeMessage = {
  to: string
  subject: string
  html: string
  message_id: string
  sent_at: string
}

const MAX_MESSAGES = 500

const messages: FakeMessage[] = []
let counter = 0

const normalize = (email: string): string => email.trim().toLowerCase()

function record(message: Message): FakeMessage {
  counter += 1
  const entry: FakeMessage = {
    to: String(message.to ?? ''),
    subject: message.subject ?? '',
    html: message.html ?? '',
    message_id: `fake-${String(counter).padStart(10, '0')}@dorado.invalid`,
    sent_at: new Date().toISOString(),
  }
  messages.push(entry)
  if (messages.length > MAX_MESSAGES) messages.splice(0, messages.length - MAX_MESSAGES)
  return entry
}

export function transport(): Transport {
  return { sendMail: async (message: Message) => ({ messageId: record(message).message_id }) }
}

export function lastMessageTo(email: string): FakeMessage | null {
  const wanted = normalize(email)
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (normalize(messages[index].to) === wanted) return messages[index]
  }
  return null
}

export function lastCodeTo(email: string): string | null {
  const message = lastMessageTo(email)
  if (!message) return null
  const found = message.html.match(/(?<![#\d])(\d{6})(?!\d)/)
  return found ? found[1] : null
}

export function sent(): readonly FakeMessage[] {
  return messages
}

export function byMessageId(message_id: string): FakeMessage | null {
  return messages.find((message) => message.message_id === message_id) ?? null
}

export function reset(): void {
  messages.length = 0
  counter = 0
}
