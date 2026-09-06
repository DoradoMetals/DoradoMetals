import { test, afterEach, vi } from 'vitest'
import assert from 'node:assert/strict'

vi.mock('axios', () => ({ default: { post: vi.fn() } }))

import axios from 'axios'
import * as captcha from '#providers/captcha/index.ts'

const post = vi.mocked(axios.post)

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
  post.mockReset()
})

const answers = (data: unknown) => post.mockResolvedValue({ data } as never)

const bodyOf = (call: number): URLSearchParams => post.mock.calls[call][1] as URLSearchParams

test('the default provider is recaptcha and it scores against the threshold', async () => {
  set('CAPTCHA_PROVIDER', undefined)
  set('RECAPTCHA_SECRET_KEY', 'recaptcha-secret')
  set('RECAPTCHA_THRESHOLD', '0.5')

  assert.equal(captcha.providerName(), 'recaptcha')

  answers({ success: true, score: 0.9 })
  assert.equal(await captcha.verify('token-a', '203.0.113.7'), true)

  answers({ success: true, score: 0.1 })
  assert.equal(await captcha.verify('token-a', '203.0.113.7'), false)

  answers({ success: false, score: 0.9 })
  assert.equal(await captcha.verify('token-a', '203.0.113.7'), false)

  assert.equal(post.mock.calls[0][0], 'https://www.google.com/recaptcha/api/siteverify')
  assert.equal(bodyOf(0).get('secret'), 'recaptcha-secret')
  assert.equal(bodyOf(0).get('response'), 'token-a')
  assert.equal(bodyOf(0).get('remoteip'), '203.0.113.7')
})

test('CAPTCHA_PROVIDER=turnstile calls Cloudflare and reads success alone', async () => {
  set('CAPTCHA_PROVIDER', 'turnstile')
  set('TURNSTILE_SECRET_KEY', 'turnstile-secret')

  assert.equal(captcha.providerName(), 'turnstile')

  answers({ success: true })
  assert.equal(await captcha.verify('token-b', '203.0.113.7'), true)

  answers({ success: false, 'error-codes': ['invalid-input-response'] })
  assert.equal(await captcha.verify('token-b', '203.0.113.7'), false)

  assert.equal(
    post.mock.calls[0][0],
    'https://challenges.cloudflare.com/turnstile/v0/siteverify'
  )
  assert.equal(bodyOf(0).get('secret'), 'turnstile-secret')
  assert.equal(bodyOf(0).get('response'), 'token-b')
  assert.equal(bodyOf(0).get('remoteip'), '203.0.113.7')
})

test('a null ip is simply not sent, by either adapter', async () => {
  set('RECAPTCHA_SECRET_KEY', 'recaptcha-secret')
  set('TURNSTILE_SECRET_KEY', 'turnstile-secret')

  set('CAPTCHA_PROVIDER', undefined)
  answers({ success: true, score: 0.9 })
  await captcha.verify('token-c', null)
  assert.equal(bodyOf(0).has('remoteip'), false)

  set('CAPTCHA_PROVIDER', 'turnstile')
  answers({ success: true })
  await captcha.verify('token-c', null)
  assert.equal(bodyOf(1).has('remoteip'), false)
})

test('an unknown CAPTCHA_PROVIDER falls back to recaptcha', () => {
  set('CAPTCHA_PROVIDER', 'hcaptcha')
  assert.equal(captcha.providerName(), 'recaptcha')
})

test('both adapters refuse an empty token without calling out', async () => {
  set('RECAPTCHA_SECRET_KEY', 'recaptcha-secret')
  set('TURNSTILE_SECRET_KEY', 'turnstile-secret')

  set('CAPTCHA_PROVIDER', undefined)
  await assert.rejects(() => captcha.verify('', null), /token is missing/)

  set('CAPTCHA_PROVIDER', 'turnstile')
  await assert.rejects(() => captcha.verify('', null), /token is missing/)

  assert.equal(post.mock.calls.length, 0)
})

test('a missing secret refuses rather than asking anonymously', async () => {
  set('CAPTCHA_PROVIDER', 'turnstile')
  set('TURNSTILE_SECRET_KEY', undefined)
  await assert.rejects(() => captcha.verify('token-d', null), /TURNSTILE_SECRET_KEY/)

  set('CAPTCHA_PROVIDER', 'recaptcha')
  set('RECAPTCHA_SECRET_KEY', undefined)
  await assert.rejects(() => captcha.verify('token-d', null), /RECAPTCHA_SECRET_KEY/)
})
