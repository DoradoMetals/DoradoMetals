import { test, beforeEach } from 'vitest'
import assert from 'node:assert/strict'

import * as fake from '#providers/sms/fake.ts'

beforeEach(() => fake.reset())

test('a send is recorded and reported back by number', async () => {
  const result = await fake.send('+15125550199', 'Your Dorado code is 481920.')

  assert.equal(result.status, 'queued')
  assert.match(result.provider_sid, /^SMfake0*1$/)
  assert.equal(fake.sent().length, 1)

  const message = fake.lastMessageTo('+15125550199')
  assert.equal(message?.body, 'Your Dorado code is 481920.')
})

test('lastCodeTo returns the six-digit code', async () => {
  await fake.send('+15125550199', 'Your Dorado code is 481920. It expires in 10 minutes.')
  assert.equal(fake.lastCodeTo('+15125550199'), '481920')
})

test('the number is matched on digits, however it is formatted', async () => {
  await fake.send('+1 (512) 555-0199', 'code 123456')
  assert.equal(fake.lastCodeTo('+15125550199'), '123456')
})

test('the LAST send to a number wins', async () => {
  await fake.send('+15125550199', 'code 111111')
  await fake.send('+15125550199', 'code 222222')
  assert.equal(fake.lastCodeTo('+15125550199'), '222222')
})

test('a number with nothing sent to it is null, not a throw', () => {
  assert.equal(fake.lastMessageTo('+15125550100'), null)
  assert.equal(fake.lastCodeTo('+15125550100'), null)
})

test('a body with no six-digit run has no code', async () => {
  await fake.send('+15125550199', 'your order 12345678 shipped')
  assert.equal(fake.lastCodeTo('+15125550199'), null)
})

test('reset empties the recording', async () => {
  await fake.send('+15125550199', 'code 333333')
  fake.reset()
  assert.equal(fake.sent().length, 0)
  assert.equal(fake.lastCodeTo('+15125550199'), null)
})
