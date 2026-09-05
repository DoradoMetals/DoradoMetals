import { describe, it } from 'vitest'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { payoutKeyFromEnv } from '#shared/crypto/payoutKey.ts'

function withEnv(overrides: Record<string, string | undefined>, fn: () => void): void {
  const saved: Record<string, string | undefined> = {}
  for (const k of Object.keys(overrides)) saved[k] = process.env[k]
  try {
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    fn()
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

describe('payoutKeyFromEnv', () => {
  it('loads the key from PAYOUT_ENCRYPTION_KEY, defaulting the id to k1', () => {
    const raw = randomBytes(32).toString('base64')
    withEnv({ PAYOUT_ENCRYPTION_KEY: raw, PAYOUT_ENCRYPTION_KEY_ID: undefined }, () => {
      const key = payoutKeyFromEnv()
      assert.equal(key.id, 'k1')
      assert.equal(key.bytes.toString('base64'), raw)
    })
  })

  it('uses PAYOUT_ENCRYPTION_KEY_ID when one is set', () => {
    const raw = randomBytes(32).toString('base64')
    withEnv({ PAYOUT_ENCRYPTION_KEY: raw, PAYOUT_ENCRYPTION_KEY_ID: 'k7' }, () => {
      const key = payoutKeyFromEnv()
      assert.equal(key.id, 'k7')
    })
  })

  it('refuses, without the value, when PAYOUT_ENCRYPTION_KEY is not set', () => {
    withEnv({ PAYOUT_ENCRYPTION_KEY: undefined }, () => {
      assert.throws(
        () => payoutKeyFromEnv(),
        (err: any) => {
          assert.match(err.message, /PAYOUT_ENCRYPTION_KEY is not set/)
          assert.ok(!('bytes' in err), 'the error must never carry key material')
          return true
        }
      )
    })
  })

  it("propagates parseKey's own refusal for a malformed key rather than swallowing it", () => {
    withEnv({ PAYOUT_ENCRYPTION_KEY: randomBytes(16).toString('base64') }, () => {
      assert.throws(() => payoutKeyFromEnv(), /must be 32 bytes/)
    })
  })
})
