import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import { randomUUID } from 'node:crypto'
import pool from '#pool'
import { inRollback } from '#shared/testing/rollback.ts'
import * as mailers from '#db/media/emails/repo.ts'
import * as emails from '#documents/emails/service.ts'
import * as rules from '#documents/emails/rules.ts'
import type { EmailKind } from '#documents/emails/record.ts'
import type { ResendEvent } from '#providers/communications/email/index.ts'

afterAll(async () => {
  await pool.end()
})

const AT = '2026-09-11T00:00:00.000Z'
const LATER = '2026-09-11T01:00:00.000Z'

const address = () => `resend-${randomUUID().slice(0, 8)}@example.invalid`

async function aSentRow(
  c: PoolClient,
  to_address: string,
  provider_message_id: string,
  kind: EmailKind = 'sign_in_code'
): Promise<string> {
  const { id } = await mailers.create(
    {
      kind,
      status: 'sent',
      to_address,
      subject: 'Your Dorado sign-in code',
      order_id: null,
      provider_message_id,
    },
    c
  )
  return id
}

const event = (type: string, email_id: string, at = AT, bounce_reason: string | null = null) =>
  ({ event_id: `msg_${email_id}`, type, email_id, occurred_at: at, bounce_reason }) as ResendEvent

const stateOf = async (c: PoolClient, id: string) => {
  const { rows } = await c.query(
    'SELECT status, delivered_at, bounced_at, bounce_reason, complained_at FROM media.emails WHERE id = $1',
    [id]
  )
  return rows[0] as {
    status: string
    delivered_at: Date | null
    bounced_at: Date | null
    bounce_reason: string | null
    complained_at: Date | null
  }
}

test('a delivery lands on the row the message id names', async () => {
  await inRollback(async (c: PoolClient) => {
    const message = randomUUID()
    const id = await aSentRow(c, address(), message)

    await emails.applyDeliveryEvent(event('email.delivered', message), c)

    const row = await stateOf(c, id)
    assert.equal(row.delivered_at?.toISOString(), AT)
    assert.equal(row.bounced_at, null)
    assert.equal(row.status, 'sent', 'the send outcome was overwritten by the delivery outcome')
  })
})

test('the same delivery replayed changes nothing', async () => {
  await inRollback(async (c: PoolClient) => {
    const message = randomUUID()
    const id = await aSentRow(c, address(), message)

    await emails.applyDeliveryEvent(event('email.delivered', message), c)
    await emails.applyDeliveryEvent(event('email.delivered', message, LATER), c)

    assert.equal((await stateOf(c, id)).delivered_at?.toISOString(), AT)
  })
})

test('a bounce after a delivery is a bounce', async () => {
  await inRollback(async (c: PoolClient) => {
    const message = randomUUID()
    const id = await aSentRow(c, address(), message)

    await emails.applyDeliveryEvent(event('email.delivered', message), c)
    await emails.applyDeliveryEvent(
      event('email.bounced', message, LATER, 'mailbox unavailable'),
      c
    )

    const row = await stateOf(c, id)
    assert.equal(row.bounced_at?.toISOString(), LATER)
    assert.equal(row.bounce_reason, 'mailbox unavailable')
    assert.equal(row.delivered_at?.toISOString(), AT, 'the earlier delivery was erased')
  })
})

test('a delivery after a bounce is ignored', async () => {
  await inRollback(async (c: PoolClient) => {
    const message = randomUUID()
    const id = await aSentRow(c, address(), message)

    await emails.applyDeliveryEvent(event('email.bounced', message, AT, 'mailbox unavailable'), c)
    await emails.applyDeliveryEvent(event('email.delivered', message, LATER), c)

    const row = await stateOf(c, id)
    assert.equal(row.delivered_at, null, 'a delivery overwrote a bounce already recorded')
    assert.equal(row.bounced_at?.toISOString(), AT)
  })
})

test('a complaint is recorded, and a second one does not move it', async () => {
  await inRollback(async (c: PoolClient) => {
    const message = randomUUID()
    const id = await aSentRow(c, address(), message)

    await emails.applyDeliveryEvent(event('email.complained', message), c)
    await emails.applyDeliveryEvent(event('email.complained', message, LATER), c)

    assert.equal((await stateOf(c, id)).complained_at?.toISOString(), AT)
  })
})

test('an event with no column, and one naming a message we never sent, write nothing', async () => {
  await inRollback(async (c: PoolClient) => {
    const message = randomUUID()
    const id = await aSentRow(c, address(), message)

    await emails.applyDeliveryEvent(event('email.delivery_delayed', message), c)
    await emails.applyDeliveryEvent(event('email.opened', message), c)
    await emails.applyDeliveryEvent(event('email.delivered', randomUUID()), c)

    const row = await stateOf(c, id)
    assert.equal(row.delivered_at, null)
    assert.equal(row.bounced_at, null)
    assert.equal(row.complained_at, null)
  })
})

test('a bounced address is suppressed; a clean one is not', async () => {
  await inRollback(async (c: PoolClient) => {
    const bounced = address()
    const clean = address()
    const message = randomUUID()
    await aSentRow(c, bounced, message)
    await aSentRow(c, clean, randomUUID())

    assert.equal(await mailers.isSuppressed(bounced, c), false)
    await emails.applyDeliveryEvent(event('email.bounced', message, AT, 'no such user'), c)
    assert.equal(await mailers.isSuppressed(bounced, c), true)
    assert.equal(await mailers.isSuppressed(clean, c), false)
  })
})

test('a complaint suppresses the address too', async () => {
  await inRollback(async (c: PoolClient) => {
    const complained = address()
    const message = randomUUID()
    await aSentRow(c, complained, message)

    await emails.applyDeliveryEvent(event('email.complained', message), c)
    assert.equal(await mailers.isSuppressed(complained, c), true)
  })
})

test('only the promo kind consults the suppression list', () => {
  assert.equal(rules.suppressible('promo'), true)
  for (const kind of [
    'sign_in_code',
    'account_created',
    'details_changed',
    'purchase_order_created',
    'sales_order_created',
    'payout_sent',
    'shipment_sent',
    'document_sent',
  ] as EmailKind[]) {
    assert.equal(rules.suppressible(kind), false, `${kind} was treated as marketing`)
  }
})

test('which events the trail has a column for', () => {
  assert.equal(rules.deliveryOutcomeOf('email.delivered'), 'delivered')
  assert.equal(rules.deliveryOutcomeOf('email.bounced'), 'bounced')
  assert.equal(rules.deliveryOutcomeOf('email.complained'), 'complained')
  assert.equal(rules.deliveryOutcomeOf('email.delivery_delayed'), null)
  assert.equal(rules.deliveryOutcomeOf('email.opened'), null)
  assert.equal(rules.deliveryOutcomeOf('email.sent'), null)
})
