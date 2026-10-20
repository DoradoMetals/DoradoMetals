import { test, afterAll, beforeEach } from 'vitest'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser } from '#shared/testing/builders/index.ts'
import { logger } from '#shared/logging/logger.ts'
import * as plaidFake from '#providers/plaid/fake.ts'
import type { PlaidVerificationKey } from '#providers/plaid/types.ts'
import { BankLinkSendBody, LinkedAccount } from '@dorado/contracts'

await mockSessions()
const { default: app } = await import('#app')

const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
const jwk = publicKey.export({ format: 'jwk' }) as {
  kty: string
  crv: string
  x: string
  y: string
}
const KEY: PlaidVerificationKey = { ...jwk, kid: 'drawer-key', alg: 'ES256', use: 'sig' }

beforeEach(() => {
  plaidFake.reset()
  plaidFake.trustKey(KEY)
})

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const admin = { ...TEST_ACTOR, role: 'admin' }
const PHONE = '+15125550117'
const FORBIDDEN = /routing|account_number|access_token|access-sandbox|processor/i

const inLinks = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: LOCKS.USERS })

const b64 = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url')

function signed(body: string): string {
  const header = b64({ alg: 'ES256', kid: KEY.kid, typ: 'JWT' })
  const payload = b64({
    iat: Math.floor(Date.now() / 1000),
    request_body_sha256: crypto.createHash('sha256').update(body, 'utf8').digest('hex'),
  })
  const signature = crypto.sign('sha256', Buffer.from(`${header}.${payload}`), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  })
  return `${header}.${payload}.${signature.toString('base64url')}`
}

const deliver = (event: object) => {
  const body = JSON.stringify(event)
  return request(app)
    .post('/api/webhooks/plaid')
    .set('Content-Type', 'application/json')
    .set('plaid-verification', signed(body))
    .send(body)
}

const send = (user_id: string, channel: 'sms' | 'email') =>
  as(admin, () => request(app).post(`/api/accounts/${user_id}/bank-links`).send({ channel }))

const list = (user_id: string, who: object = admin) =>
  as(who as typeof admin, () => request(app).get(`/api/accounts/${user_id}/bank-links`))

function captureLogs(): { lines: string[]; restore: () => void } {
  const lines: string[] = []
  const levels = ['info', 'warn', 'error', 'debug'] as const
  const originals = levels.map((level) => logger[level].bind(logger))
  for (const level of levels) {
    ;(logger as unknown as Record<string, unknown>)[level] = (...args: unknown[]) => {
      lines.push(JSON.stringify(args))
    }
  }
  return {
    lines,
    restore: () =>
      levels.forEach((level, i) => {
        ;(logger as unknown as Record<string, unknown>)[level] = originals[i]
      }),
  }
}

const finished = (link_token: string, public_token: string) => ({
  webhook_type: 'LINK',
  webhook_code: 'SESSION_FINISHED',
  status: 'SUCCESS',
  link_session_id: `session-${public_token}`,
  link_token,
  public_tokens: [public_token],
  environment: 'sandbox',
})

test('the send body is a channel only; the destination comes from the customer record', () => {
  assert.equal(BankLinkSendBody.safeParse({ channel: 'sms' }).success, true)
  assert.equal(BankLinkSendBody.safeParse({ channel: 'email' }).success, true)
  assert.equal(BankLinkSendBody.safeParse({ channel: 'fax' }).success, false)
  assert.equal(BankLinkSendBody.safeParse({ channel: 'sms', to: PHONE }).success, false)
})

test('an admin sends a Hosted Link by SMS and a pending link is recorded', async () => {
  await inLinks(async (c) => {
    const customer = await aUser(c, { phone_number: PHONE })
    const res = await send(customer.id, 'sms')
    assert.equal(res.status, 201, res.text)
    const link = LinkedAccount.parse(res.body)
    assert.equal(link.user_id, customer.id)
    assert.equal(link.status, 'pending')
    assert.equal(link.channel, 'sms')
    assert.equal(link.sent_to, PHONE)
    assert.ok(link.sent_at)
    assert.equal(link.bank_name, null)
    assert.equal(link.last_four, null)
    assert.equal(FORBIDDEN.test(JSON.stringify(res.body)), false, JSON.stringify(res.body))

    const hosted = plaidFake.hostedLinks()
    assert.equal(hosted.length, 1, 'the provider was not asked for a Hosted Link')
    assert.equal(hosted[0]!.client_user_id, customer.id)
    assert.equal(hosted[0]!.channel, 'sms')
    assert.equal(hosted[0]!.to, PHONE)
  })
})

test('a Hosted Link Plaid refuses leaves the row Errored, and a resend makes it Pending again', async () => {
  await inLinks(async (c) => {
    const customer = await aUser(c, { phone_number: PHONE })
    plaidFake.refuseNextHostedLink()
    const res = await send(customer.id, 'sms')
    assert.equal(res.status, 201, res.text)
    const link = LinkedAccount.parse(res.body)
    assert.equal(link.status, 'errored')

    const again = await as(admin, () =>
      request(app).post(`/api/accounts/${customer.id}/bank-links/${link.id}/resend`).send({})
    )
    assert.equal(again.status, 200, again.text)
    assert.equal(LinkedAccount.parse(again.body).status, 'pending')
  })
})

test('an email send goes to the email on file', async () => {
  await inLinks(async (c) => {
    const customer = await aUser(c)
    const res = await send(customer.id, 'email')
    assert.equal(res.status, 201, res.text)
    assert.equal(res.body.channel, 'email')
    assert.equal(res.body.sent_to, customer.email)
    assert.equal(plaidFake.hostedLinks()[0]!.to, customer.email)
  })
})

test('an SMS send to a customer with no phone is refused by name', async () => {
  await inLinks(async (c) => {
    const customer = await aUser(c)
    const res = await send(customer.id, 'sms')
    assert.equal(res.status, 422, res.text)
    assert.match(res.body?.error?.message ?? '', /phone/i)
    assert.equal(plaidFake.hostedLinks().length, 0)
  })
})

test('the webhook stores the provider token, bank, account name and mask and marks the link Verified', async () => {
  await inLinks(async (c) => {
    const customer = await aUser(c, { phone_number: PHONE })
    const sent = await send(customer.id, 'sms')
    assert.equal(sent.status, 201, sent.text)
    const { link_token } = plaidFake.hostedLinks()[0]!
    plaidFake.accountsFor('public-hosted-1', {
      institution_name: 'Chase',
      accounts: [
        {
          account_id: 'acc-1',
          name: 'Marguerite Whitfield',
          mask: '4417',
          verification_status: null,
        },
      ],
    })

    const logs = captureLogs()
    let res
    try {
      res = await deliver(finished(link_token, 'public-hosted-1'))
    } finally {
      logs.restore()
    }
    assert.equal(res.status, 200, res.text)
    assert.deepEqual(res.body, { received: true })

    const listed = await list(customer.id)
    assert.equal(listed.status, 200, listed.text)
    const accounts = LinkedAccount.array().parse(listed.body)
    assert.equal(
      accounts.length,
      1,
      'the webhook made a second row instead of completing the first'
    )
    assert.equal(accounts[0]!.id, sent.body.id)
    assert.equal(accounts[0]!.status, 'verified')
    assert.equal(accounts[0]!.bank_name, 'Chase')
    assert.equal(accounts[0]!.account_name, 'Marguerite Whitfield')
    assert.equal(accounts[0]!.last_four, '4417')
    assert.equal(FORBIDDEN.test(JSON.stringify(listed.body)), false, JSON.stringify(listed.body))

    const { rows } = await c.query<{ token: string | null }>(
      `SELECT to_jsonb(b)::text AS token FROM payments.bank_links b WHERE b.id = $1`,
      [sent.body.id]
    )
    assert.ok(rows[0]?.token, 'the row is gone')
    assert.ok(
      plaidFake.recorded().some((call) => call.what === 'exchangePublicToken'),
      'the public token was never exchanged for a provider token'
    )
    const replay = await deliver(finished(link_token, 'public-hosted-1'))
    assert.equal(replay.status, 200, replay.text)
    assert.equal(
      plaidFake.recorded().filter((call) => call.what === 'exchangePublicToken').length,
      1,
      'a repeated SESSION_FINISHED exchanged the public token again'
    )
    const access = plaidFake
      .recorded()
      .filter((call) => call.what === 'accounts')
      .map((call) => call.detail)[0]
    assert.ok(access, 'the accounts were never read with the provider token')
    assert.equal(
      rows[0]!.token!.includes(access!),
      false,
      'the provider token is stored in plaintext'
    )
    assert.equal(
      logs.lines.some((line) => line.includes(access!) || /routing|account_number/.test(line)),
      false,
      logs.lines.join('\n')
    )
  })
})

test('an account awaiting micro-deposits stays Pending until Plaid verifies it', async () => {
  await inLinks(async (c) => {
    const customer = await aUser(c, { phone_number: PHONE })
    const sent = await send(customer.id, 'sms')
    const { link_token } = plaidFake.hostedLinks()[0]!
    plaidFake.accountsFor('public-hosted-2', {
      institution_name: 'Frost',
      accounts: [
        {
          account_id: 'acc-2',
          name: 'Checking',
          mask: '0921',
          verification_status: 'pending_automatic_verification',
        },
      ],
    })
    assert.equal((await deliver(finished(link_token, 'public-hosted-2'))).status, 200)
    const pending = await list(customer.id)
    assert.equal(pending.body[0].status, 'pending')
    assert.equal(pending.body[0].last_four, '0921')

    const verified = await deliver({
      webhook_type: 'AUTH',
      webhook_code: 'AUTOMATICALLY_VERIFIED',
      item_id: plaidFake.itemFor('public-hosted-2'),
      account_id: 'acc-2',
    })
    assert.equal(verified.status, 200, verified.text)
    const after = await list(customer.id)
    assert.equal(after.body[0].id, sent.body.id)
    assert.equal(after.body[0].status, 'verified')
  })
})

test('a webhook naming no link of ours is accepted and changes nothing', async () => {
  await inLinks(async (c) => {
    const customer = await aUser(c, { phone_number: PHONE })
    await send(customer.id, 'sms')
    plaidFake.accountsFor('public-stray', {
      institution_name: 'Nobody',
      accounts: [{ account_id: 'x', name: 'x', mask: '0000', verification_status: null }],
    })
    const res = await deliver(finished('link-not-ours', 'public-stray'))
    assert.equal(res.status, 200, res.text)
    const listed = await list(customer.id)
    assert.equal(listed.body.length, 1)
    assert.equal(listed.body[0].status, 'pending')
  })
})

test('a resend delivers the link again and keeps one pending row; a verified link is not resent', async () => {
  await inLinks(async (c) => {
    const customer = await aUser(c, { phone_number: PHONE })
    const sent = await send(customer.id, 'sms')
    const resent = await as(admin, () =>
      request(app).post(`/api/accounts/${customer.id}/bank-links/${sent.body.id}/resend`).send({})
    )
    assert.equal(resent.status, 200, resent.text)
    assert.equal(resent.body.id, sent.body.id)
    assert.equal(resent.body.status, 'pending')
    assert.equal(plaidFake.hostedLinks().length, 2)
    assert.ok(Date.parse(resent.body.sent_at) >= Date.parse(sent.body.sent_at))
    assert.equal((await list(customer.id)).body.length, 1)

    const { link_token } = plaidFake.hostedLinks()[1]!
    plaidFake.accountsFor('public-hosted-3', {
      institution_name: 'Chase',
      accounts: [{ account_id: 'acc-3', name: 'Joint', mask: '1234', verification_status: null }],
    })
    await deliver(finished(link_token, 'public-hosted-3'))
    const again = await as(admin, () =>
      request(app).post(`/api/accounts/${customer.id}/bank-links/${sent.body.id}/resend`).send({})
    )
    assert.equal(again.status, 409, again.text)
  })
})

test("a customer may read their own linked accounts but not another customer's, and may not send", async () => {
  await inLinks(async (c) => {
    const customer = await aUser(c, { phone_number: PHONE })
    const stranger = await aUser(c)
    const asCustomer = { ...customer, role: 'user' }

    assert.equal((await list(customer.id, asCustomer)).status, 200)
    assert.equal((await list(stranger.id, asCustomer)).status, 403)
    const sendRefused = await as(asCustomer, () =>
      request(app).post(`/api/accounts/${stranger.id}/bank-links`).send({ channel: 'sms' })
    )
    assert.equal(sendRefused.status, 403, sendRefused.text)
  })
})

test('the fake provider completes a link for end-to-end runs, outside production only', async () => {
  await inLinks(async (c) => {
    const customer = await aUser(c, { phone_number: PHONE })
    const sent = await send(customer.id, 'sms')
    const res = await as(admin, () =>
      request(app).post('/api/webhooks/plaid/fake').send({ link_id: sent.body.id })
    )
    assert.equal(res.status, 200, res.text)
    const listed = await list(customer.id)
    assert.equal(listed.body[0].status, 'verified')
    assert.ok(listed.body[0].last_four)
  })
})
