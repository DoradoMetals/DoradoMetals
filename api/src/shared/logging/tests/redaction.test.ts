import { test } from 'vitest'
import assert from 'node:assert/strict'
import pino from 'pino'
import { Writable } from 'node:stream'
import { REDACT } from '#shared/logging/logger.ts'

const SECRETS = {
  routing_number: '021000021',
  account_number: '000123456789',
  access_token: 'access-sandbox-secret',
  public_token: 'public-sandbox-secret',
  provider_token_encrypted: 'sealed-secret-bytes',
  processor_token: 'processor-sandbox-secret',
}

test('bank numbers and provider tokens never reach a log line, top level or nested', () => {
  const lines: string[] = []
  const sink = new Writable({
    write(chunk, _encoding, done) {
      lines.push(String(chunk))
      done()
    },
  })
  const log = pino({ level: 'info', redact: REDACT }, sink)
  log.info({ ...SECRETS }, 'top level')
  log.info({ link: { ...SECRETS } }, 'nested')
  const written = lines.join('\n')
  for (const [key, value] of Object.entries(SECRETS)) {
    assert.equal(written.includes(value), false, `${key} leaked into a log line`)
  }
  assert.ok(written.includes('[REDACTED]'))
})
