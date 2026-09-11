import { test, beforeEach } from 'vitest'
import assert from 'node:assert/strict'

import * as fake from '#providers/emails/fake.ts'

beforeEach(() => fake.reset())

test('a send is recorded and reported back by address', async () => {
  const result = (await fake.transport().sendMail({
    to: 'someone@example.com',
    subject: 'Your Dorado sign-in code',
    html: '<p>481920 is your code.</p>',
  })) as { messageId: string }

  assert.match(result.messageId, /^fake-/)
  assert.equal(fake.sent().length, 1)

  const message = fake.lastMessageTo('someone@example.com')
  assert.equal(message?.html, '<p>481920 is your code.</p>')
})

test('lastCodeTo returns the six-digit code', async () => {
  await fake.transport().sendMail({
    to: 'someone@example.com',
    subject: 's',
    html: '<p>Your code is 481920. It expires in 10 minutes.</p>',
  })
  assert.equal(fake.lastCodeTo('someone@example.com'), '481920')
})

test('the address is matched case-insensitively', async () => {
  await fake.transport().sendMail({ to: 'Someone@Example.com', subject: 's', html: '<p>123456</p>' })
  assert.equal(fake.lastCodeTo('someone@example.com'), '123456')
})

test('the LAST send to an address wins', async () => {
  await fake.transport().sendMail({ to: 'someone@example.com', subject: 's', html: '<p>111111</p>' })
  await fake.transport().sendMail({ to: 'someone@example.com', subject: 's', html: '<p>222222</p>' })
  assert.equal(fake.lastCodeTo('someone@example.com'), '222222')
})

test('an address with nothing sent to it is null, not a throw', () => {
  assert.equal(fake.lastMessageTo('nobody@example.com'), null)
  assert.equal(fake.lastCodeTo('nobody@example.com'), null)
})

test('a hex color in the mailer chrome is not mistaken for the code', async () => {
  await fake.transport().sendMail({
    to: 'someone@example.com',
    subject: 's',
    html:
      '<table bgcolor="#101114" style="background-color:#101114;">' +
      '<div>512340 is your code.</div></table>',
  })
  assert.equal(
    fake.lastCodeTo('someone@example.com'),
    '512340',
    'the six all-digit hex background was read as the code'
  )
})

test('a body with no six-digit run has no code', async () => {
  await fake.transport().sendMail({
    to: 'someone@example.com',
    subject: 's',
    html: '<p>your order 12345678 shipped</p>',
  })
  assert.equal(fake.lastCodeTo('someone@example.com'), null)
})

test('reset empties the recording', async () => {
  await fake.transport().sendMail({ to: 'someone@example.com', subject: 's', html: '<p>333333</p>' })
  fake.reset()
  assert.equal(fake.sent().length, 0)
  assert.equal(fake.lastCodeTo('someone@example.com'), null)
})
