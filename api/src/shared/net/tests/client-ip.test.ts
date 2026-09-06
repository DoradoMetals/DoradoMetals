import { test, afterEach } from 'vitest'
import assert from 'node:assert/strict'

import { clientIp } from '#shared/net/client-ip.ts'
import type { IpSource } from '#shared/net/client-ip.ts'

const SOCKET = '203.0.113.7'
const HEADER = '198.51.100.9'

const saved = process.env.TRUST_CLOUDFLARE
afterEach(() => {
  if (saved === undefined) delete process.env.TRUST_CLOUDFLARE
  else process.env.TRUST_CLOUDFLARE = saved
})

const trust = (on: boolean) => {
  if (on) process.env.TRUST_CLOUDFLARE = '1'
  else delete process.env.TRUST_CLOUDFLARE
}

const request = (headers: Record<string, string | string[] | undefined>, remote = SOCKET) =>
  ({ headers, socket: { remoteAddress: remote } }) satisfies IpSource

test('trusted and the header is a single valid IP: the header wins', () => {
  trust(true)
  assert.equal(clientIp(request({ 'cf-connecting-ip': HEADER })), HEADER)
})

test('trusted and the header is absent: the socket address', () => {
  trust(true)
  assert.equal(clientIp(request({})), SOCKET)
})

test('untrusted and the header is present: it is IGNORED', () => {
  trust(false)
  assert.equal(clientIp(request({ 'cf-connecting-ip': HEADER })), SOCKET)

  process.env.TRUST_CLOUDFLARE = '0'
  assert.equal(clientIp(request({ 'cf-connecting-ip': HEADER })), SOCKET)

  process.env.TRUST_CLOUDFLARE = 'true'
  assert.equal(clientIp(request({ 'cf-connecting-ip': HEADER })), SOCKET)
})

test('X-Forwarded-For is never read, trusted or not', () => {
  for (const on of [true, false]) {
    trust(on)
    const headers = { 'x-forwarded-for': `${HEADER}, 10.0.0.1`, 'X-Forwarded-For': HEADER }
    assert.equal(clientIp(request(headers)), SOCKET)
  }
})

test('a header that is not a single valid IP falls back to the socket', () => {
  trust(true)
  for (const bad of ['', '  ', 'not-an-ip', `${HEADER}, 10.0.0.1`, '198.51.100.9 10.0.0.1']) {
    assert.equal(clientIp(request({ 'cf-connecting-ip': bad })), SOCKET, bad)
  }
  assert.equal(clientIp(request({ 'cf-connecting-ip': [HEADER] })), SOCKET)
})

test('an IPv4-mapped IPv6 socket address is normalised', () => {
  trust(false)
  assert.equal(clientIp(request({}, '::ffff:203.0.113.7')), SOCKET)
})

test('an IPv6 address survives untouched', () => {
  trust(true)
  assert.equal(clientIp(request({ 'cf-connecting-ip': '2001:db8::1' })), '2001:db8::1')
  assert.equal(clientIp(request({}, '2001:db8::2')), '2001:db8::2')
})

test('no header and no socket address is null', () => {
  trust(true)
  assert.equal(clientIp({ headers: {} }), null)
  assert.equal(clientIp({ headers: {}, socket: null }), null)
  assert.equal(clientIp(request({}, '')), null)
})
