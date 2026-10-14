import * as fakeEmail from '#providers/resend/fake.ts'
import type { FakeMessage } from '#providers/resend/fake.ts'
import * as rules from '#documents/outbox/rules.ts'
import type { OutboxMessage } from '@dorado/contracts'

export function list(): OutboxMessage[] {
  return [...fakeEmail.sent()].reverse().map(rules.outboxMessageView)
}

export function show(message_id: string): FakeMessage {
  const message = fakeEmail.byMessageId(message_id)
  rules.assertOutboxMessage(message, message_id)
  return message
}
