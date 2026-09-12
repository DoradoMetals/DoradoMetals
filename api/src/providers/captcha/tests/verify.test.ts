import { test, afterEach, vi } from 'vitest'
import assert from 'node:assert/strict'

vi.mock('axios', () => ({ default: { post: vi.fn() } }))

import axios from 'axios'
import * as captcha from '#providers/captcha/index.ts'
import * as fake from '#providers/captcha/fake.ts'
import * as turnstile from '#providers/captcha/turnstile.ts'

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
  fake.reset()
})

const answers = (data: unknown) => post.mockResolvedValue({ data } as never)

const bodyOf = (call: number): URLSearchParams => post.mock.calls[call][1] as URLSearchParams

test('the adapter asks Cloudflare and reads success alone', async () => {
  set('TURNSTILE_SECRET_KEY', 'turnstile-secret')

  answers({ success: true })
  assert.equal(await turnstile.verify('token-a', '203.0.113.7'), true)

  answers({ success: false, 'error-codes': ['invalid-input-response'] })
  assert.equal(await turnstile.verify('token-a', '203.0.113.7'), false)

  assert.equal(post.mock.calls[0][0], 'https://challenges.cloudflare.com/turnstile/v0/siteverify')
  assert.equal(bodyOf(0).get('secret'), 'turnstile-secret')
  assert.equal(bodyOf(0).get('response'), 'token-a')
  assert.equal(bodyOf(0).get('remoteip'), '203.0.113.7')
})

test('a null ip is simply not sent', async () => {
  set('TURNSTILE_SECRET_KEY', 'turnstile-secret')
  answers({ success: true })
  await turnstile.verify('token-b', null)
  assert.equal(bodyOf(0).has('remoteip'), false)
})

test('a missing token is refused without asking Cloudflare', async () => {
  set('TURNSTILE_SECRET_KEY', 'turnstile-secret')
  assert.equal(await turnstile.verify('', '203.0.113.7'), false)
  assert.equal(post.mock.calls.length, 0, 'an empty token must not cost a siteverify call')
})

test('a missing secret refuses rather than asking anonymously', async () => {
  set('TURNSTILE_SECRET_KEY', undefined)
  await assert.rejects(() => turnstile.verify('token-c', null), /TURNSTILE_SECRET_KEY/)
  assert.equal(post.mock.calls.length, 0)
})

test('the fake records every check and accepts by default', async () => {
  assert.equal(await captcha.verify('token-d', '203.0.113.7'), true)
  assert.deepEqual(
    fake.checked().map((each) => [each.token, each.ip, each.passed]),
    [['token-d', '203.0.113.7', true]]
  )
  assert.equal(post.mock.calls.length, 0, 'the fake must never reach the network')
})

test('the fake can be told to refuse, one answer at a time', async () => {
  fake.next(false, true)
  assert.equal(await captcha.verify('token-e', null), false)
  assert.equal(await captcha.verify('token-e', null), true)
  assert.equal(await captcha.verify('token-e', null), true)
})

test('a test run takes the fake even when a real secret is present', async () => {
  set('TURNSTILE_SECRET_KEY', 'turnstile-secret')
  assert.equal(captcha.selected(), 'fake')
  assert.equal(captcha.isFake(), true)
  assert.equal(await captcha.verify('token-f', null), true)
  assert.equal(post.mock.calls.length, 0)
})

test('outside a test run the secret is what selects the real adapter', () => {
  set('NODE_ENV', 'development')
  set('TURNSTILE_SECRET_KEY', 'turnstile-secret')
  assert.equal(captcha.selected(), 'turnstile')

  set('TURNSTILE_SECRET_KEY', undefined)
  assert.equal(captcha.selected(), 'fake')
})

test('the fake refuses to be the production captcha', async () => {
  set('NODE_ENV', 'production')
  set('TURNSTILE_SECRET_KEY', undefined)
  await assert.rejects(() => captcha.verify('token-g', null), /never wave a bot through/)
})
