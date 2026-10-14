import { test, afterEach } from 'vitest'
import assert from 'node:assert/strict'
import { applyRedirect } from '#providers/resend/resend.ts'

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
})

const MESSAGE = { to: 'customer@example.com', subject: 'Your order', html: '<p>x</p>' }

test('outside production, a set MAIL_REDIRECT_TO sends the message there instead', () => {
  set('NODE_ENV', 'development')
  set('MAIL_REDIRECT_TO', 'jacob@dorado.test')
  assert.equal(applyRedirect(MESSAGE).to, 'jacob@dorado.test')
})

test('the original recipient is prefixed onto the subject', () => {
  set('NODE_ENV', 'development')
  set('MAIL_REDIRECT_TO', 'jacob@dorado.test')
  assert.equal(applyRedirect(MESSAGE).subject, '[to: customer@example.com] Your order')
})

test('with no MAIL_REDIRECT_TO set, the message is untouched', () => {
  set('NODE_ENV', 'development')
  set('MAIL_REDIRECT_TO', undefined)
  assert.deepEqual(applyRedirect(MESSAGE), MESSAGE)
})

test('in production the redirect is refused even if the variable is set', () => {
  set('NODE_ENV', 'production')
  set('MAIL_REDIRECT_TO', 'jacob@dorado.test')
  assert.deepEqual(
    applyRedirect(MESSAGE),
    MESSAGE,
    'production must never send a customer email somewhere else'
  )
})
