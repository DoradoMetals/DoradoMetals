import { test, afterEach } from 'vitest'
import assert from 'node:assert/strict'

import * as email from '#providers/communications/email/index.ts'
import * as fake from '#providers/communications/email/fake.ts'

const KEYS = ['EMAIL_HOST', 'NODE_ENV'] as const

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

test('the module imports with no EMAIL_HOST set at all', () => {
  for (const key of KEYS) set(key, undefined)
  assert.equal(typeof email.sendEmail, 'function')
  assert.equal(typeof email.deliver, 'function')
})

test('with no EMAIL_HOST, outside a test run, the fake is still selected', () => {
  set('NODE_ENV', 'development')
  set('EMAIL_HOST', undefined)
  assert.equal(email.isFake(), true)
})

test('with EMAIL_HOST set, outside a test run, the real adapter is selected', () => {
  set('NODE_ENV', 'development')
  set('EMAIL_HOST', 'smtp.example.test')
  assert.equal(email.isFake(), false)
})

test('a test run selects the fake even when EMAIL_HOST is configured', () => {
  set('NODE_ENV', 'test')
  set('EMAIL_HOST', 'smtp.example.test')
  assert.equal(email.isFake(), true)
})

test('sending with no EMAIL_HOST lands in the fake, and the code is read back', async () => {
  set('EMAIL_HOST', undefined)

  await email.sendEmail({
    to: 'someone@example.com',
    subject: 'Your Dorado sign-in code',
    html: '<p>Your code is 654321.</p>',
  })
  assert.equal(fake.lastCodeTo('someone@example.com'), '654321')
})

test('production refuses to boot the fake', async () => {
  set('EMAIL_HOST', undefined)
  set('NODE_ENV', 'production')

  await assert.rejects(
    () => email.sendEmail({ to: 'someone@example.com', subject: 's', html: '<p>x</p>' }),
    /refusing to use the email fake in production/
  )
})
