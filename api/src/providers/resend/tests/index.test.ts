import { test, afterEach } from 'vitest'
import assert from 'node:assert/strict'

import * as email from '#providers/resend/index.ts'
import * as fake from '#providers/resend/fake.ts'

const KEYS = ['RESEND_API_KEY', 'NODE_ENV'] as const

const saved = new Map<string, string | undefined>()
const set = (name: string, value: string | undefined) => {
  if (!saved.has(name)) saved.set(name, process.env[name])
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  saved.clear()
  fake.reset()
})

test('the module imports with no RESEND_API_KEY set at all', () => {
  for (const key of KEYS) set(key, undefined)
  assert.equal(typeof email.sendEmail, 'function')
  assert.equal(typeof email.deliver, 'function')
})

test('with no RESEND_API_KEY, outside a test run, the fake is still selected', () => {
  set('NODE_ENV', 'development')
  set('RESEND_API_KEY', undefined)
  assert.equal(email.isFake(), true)
})

test('with RESEND_API_KEY set, outside a test run, the real adapter is selected', () => {
  set('NODE_ENV', 'development')
  set('RESEND_API_KEY', 're_test_key')
  assert.equal(email.isFake(), false)
})

test('a test run selects the fake even when RESEND_API_KEY is configured', () => {
  set('NODE_ENV', 'test')
  set('RESEND_API_KEY', 're_test_key')
  assert.equal(email.isFake(), true)
})

test('sending with no RESEND_API_KEY lands in the fake, and the code is read back', async () => {
  set('RESEND_API_KEY', undefined)

  await email.sendEmail({
    to: 'someone@example.com',
    subject: 'Your Dorado sign-in code',
    html: '<p>Your code is 654321.</p>',
  })
  assert.equal(fake.lastCodeTo('someone@example.com'), '654321')
})

test('production refuses to boot the fake', async () => {
  set('RESEND_API_KEY', undefined)
  set('NODE_ENV', 'production')

  await assert.rejects(
    () => email.sendEmail({ to: 'someone@example.com', subject: 's', html: '<p>x</p>' }),
    /refusing to use the email fake in production/
  )
})
