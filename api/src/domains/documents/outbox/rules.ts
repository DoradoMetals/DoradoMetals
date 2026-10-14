import { NotFound } from '#shared/errors.ts'
import type { FakeMessage } from '#providers/resend/fake.ts'
import type { OutboxMessage } from '@dorado/contracts'

export function assertOutboxMessage<T>(
  message: T | null,
  message_id: string
): asserts message is T {
  if (!message) throw new NotFound(`no outbox message ${message_id}`)
}

export function outboxMessageView(message: FakeMessage): OutboxMessage {
  return {
    message_id: message.message_id,
    to: message.to,
    subject: message.subject,
    sent_at: message.sent_at,
  }
}
