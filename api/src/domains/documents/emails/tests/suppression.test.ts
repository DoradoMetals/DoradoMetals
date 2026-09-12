import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import { randomUUID } from 'node:crypto'
import pool from '#pool'
import { inRollback } from '#shared/testing/rollback.ts'
import * as mailers from '#db/media/emails/repo.ts'
import * as emails from '#documents/emails/service.ts'
import type { Transport } from '#providers/resend/index.ts'
import type { ResendEvent } from '#providers/resend/index.ts'

afterAll(async () => {
  await pool.end()
})

type Message = Parameters<Transport['sendMail']>[0]

const recorder = (): Transport & { sent: Message[] } => {
  const sent: Message[] = []
  return {
    sent,
    sendMail: async (msg: Message) => {
      sent.push(msg)
      return { messageId: `re_${randomUUID()}` }
    },
  }
}

const address = () => `promo-${randomUUID().slice(0, 8)}@example.invalid`

const promoTo = (email: string) => ({
  order_id: null,
  user_id: null,
  email,
  name: 'Jacob',
  eyebrow: 'This week',
  headline: 'Silver is moving',
  lede: 'Here is what your scrap is worth today.',
  stat_label: 'Spot',
  stat_value: '$31.40',
  rows: [{ label: 'Sterling', value: '$23.10 / ozt' }],
  url: 'https://example.test/sell',
})

const bounce = (email_id: string): ResendEvent => ({
  event_id: `msg_${email_id}`,
  type: 'email.bounced',
  email_id,
  occurred_at: '2026-09-11T00:00:00.000Z',
  bounce_reason: 'no such user',
})

const rowsFor = async (c: PoolClient, to_address: string) => {
  const { rows } = await c.query('SELECT kind FROM media.emails WHERE to_address = $1', [
    to_address,
  ])
  return rows as { kind: string }[]
}

test('a promo reaches a clean address and files its row', async () => {
  await inRollback(async (c: PoolClient) => {
    const to = address()
    const transport = recorder()

    await emails.sendPromo(promoTo(to), transport, c)

    assert.equal(transport.sent.length, 1)
    assert.deepEqual(transport.sent[0].tags, [{ name: 'kind', value: 'promo' }])
    assert.deepEqual(await rowsFor(c, to), [{ kind: 'promo' }])
  })
})

test('a bounced address gets no further promo, and no row is filed', async () => {
  await inRollback(async (c: PoolClient) => {
    const to = address()
    const first = recorder()
    await emails.sendPromo(promoTo(to), first, c)

    const message_id = String(
      (await c.query('SELECT provider_message_id FROM media.emails WHERE to_address = $1', [to]))
        .rows[0].provider_message_id
    )
    await emails.applyDeliveryEvent(bounce(message_id), c)
    assert.equal(await mailers.isSuppressed(to, c), true)

    const second = recorder()
    await emails.sendPromo(promoTo(to), second, c)

    assert.equal(second.sent.length, 0, 'a promo reached a bounced address')
    assert.equal((await rowsFor(c, to)).length, 1, 'a suppressed promo filed a row anyway')
  })
})

test('a sign-in code still reaches a bounced address', async () => {
  await inRollback(async (c: PoolClient) => {
    const to = address()
    const first = recorder()
    await emails.sendPromo(promoTo(to), first, c)
    const message_id = String(
      (await c.query('SELECT provider_message_id FROM media.emails WHERE to_address = $1', [to]))
        .rows[0].provider_message_id
    )
    await emails.applyDeliveryEvent(bounce(message_id), c)

    const transport = recorder()
    await emails.sendSignInCode(
      {
        order_id: null,
        user_id: null,
        email: to,
        name: 'Jacob',
        code: '418209',
        expires_in_minutes: 10,
      },
      transport,
      c
    )

    assert.equal(transport.sent.length, 1, 'a sign-in code was withheld from a bounced address')
    const kinds = (await rowsFor(c, to)).map((r) => r.kind).sort()
    assert.deepEqual(kinds, ['promo', 'sign_in_code'])
  })
})
