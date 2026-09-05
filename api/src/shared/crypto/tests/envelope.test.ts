import { describe, it } from 'vitest'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import {
  parseKey,
  seal,
  open,
  aadFor,
  keyIdOf,
  isEnvelope,
  EnvelopeError,
} from '#shared/crypto/envelope.ts'

const KEY_A = parseKey('k1', randomBytes(32).toString('base64'))
const KEY_B = parseKey('k2', randomBytes(32).toString('base64'))

const ROW = '6d3f1a2e-0000-4000-8000-000000000001'
const ROUTING = '021000021'
const ACCOUNT = '1234567890'

describe('parseKey', () => {
  it('accepts a 32-byte base64 key', () => {
    const k = parseKey('k1', randomBytes(32).toString('base64'))
    assert.equal(k.id, 'k1')
    assert.equal(k.bytes.length, 32)
  })

  it('refuses a key that is not 32 bytes, and says how to make one', () => {
    assert.throws(() => parseKey('k1', randomBytes(16).toString('base64')), /must be 32 bytes/)
    assert.throws(() => parseKey('k1', randomBytes(16).toString('base64')), /randomBytes\(32\)/)
  })

  it('refuses a key id that could collide with the separator', () => {
    assert.throws(() => parseKey('k.1', randomBytes(32).toString('base64')), EnvelopeError)
    assert.throws(() => parseKey('', randomBytes(32).toString('base64')), EnvelopeError)
  })
})

describe('seal / open', () => {
  it('round-trips a routing number', () => {
    const aad = aadFor(ROW, 'routing_number')
    assert.equal(open(seal(ROUTING, KEY_A, aad), KEY_A, aad), ROUTING)
  })

  it('produces a different ciphertext every time for the same input', () => {
    const aad = aadFor(ROW, 'routing_number')
    const a = seal(ROUTING, KEY_A, aad)
    const b = seal(ROUTING, KEY_A, aad)
    assert.notEqual(a, b)
    assert.equal(open(a, KEY_A, aad), open(b, KEY_A, aad))
  })

  it('never contains the plaintext', () => {
    const sealed = seal(ACCOUNT, KEY_A, aadFor(ROW, 'account_number'))
    assert.ok(!sealed.includes(ACCOUNT))
    assert.ok(!Buffer.from(sealed, 'utf8').includes(ACCOUNT))
  })

  it('refuses to seal an empty value', () => {
    assert.throws(
      () => seal('', KEY_A, aadFor(ROW, 'routing_number')),
      /refusing to seal an empty value/
    )
  })

  it('carries the key id in the envelope', () => {
    assert.equal(keyIdOf(seal(ROUTING, KEY_A, aadFor(ROW, 'routing_number'))), 'k1')
    assert.equal(keyIdOf(seal(ROUTING, KEY_B, aadFor(ROW, 'routing_number'))), 'k2')
  })
})

describe('the bindings that make a stolen ciphertext useless', () => {
  it('refuses a ciphertext moved to another row', () => {
    const sealed = seal(ACCOUNT, KEY_A, aadFor(ROW, 'account_number'))
    const otherRow = aadFor('6d3f1a2e-0000-4000-8000-000000000002', 'account_number')
    assert.throws(() => open(sealed, KEY_A, otherRow), /authentication failed/)
  })

  it('refuses a ciphertext moved to the other column of the same row', () => {
    const sealed = seal(ACCOUNT, KEY_A, aadFor(ROW, 'account_number'))
    assert.throws(() => open(sealed, KEY_A, aadFor(ROW, 'routing_number')), /authentication failed/)
  })

  it('reports a rotated key as a key mismatch, not as corruption', () => {
    const aad = aadFor(ROW, 'routing_number')
    const sealed = seal(ROUTING, KEY_A, aad)
    assert.throws(() => open(sealed, KEY_B, aad), /sealed under key 'k1'/)
  })

  it('refuses a tampered ciphertext', () => {
    const aad = aadFor(ROW, 'routing_number')
    const parts = seal(ROUTING, KEY_A, aad).split('.')
    const ct = Buffer.from(parts[4]!, 'base64')
    ct[0] ^= 0xff
    parts[4] = ct.toString('base64')
    assert.throws(() => open(parts.join('.'), KEY_A, aad), /authentication failed/)
  })

  it('refuses a tampered tag', () => {
    const aad = aadFor(ROW, 'routing_number')
    const parts = seal(ROUTING, KEY_A, aad).split('.')
    const tag = Buffer.from(parts[3]!, 'base64')
    tag[0] ^= 0xff
    parts[3] = tag.toString('base64')
    assert.throws(() => open(parts.join('.'), KEY_A, aad), /authentication failed/)
  })
})

describe('isEnvelope', () => {
  it('recognises what seal produces and rejects everything else', () => {
    assert.equal(isEnvelope(seal(ROUTING, KEY_A, aadFor(ROW, 'routing_number'))), true)
    assert.equal(isEnvelope('021000021'), false)
    assert.equal(isEnvelope('v2.k1.a.b.c'), false)
    assert.equal(isEnvelope(null), false)
    assert.equal(isEnvelope(undefined), false)
    assert.equal(isEnvelope(''), false)
  })
})

describe('no error path carries the plaintext', () => {
  const SECRET = '987654321098765'

  const failures: Array<[string, () => unknown]> = [
    [
      'wrong row',
      () =>
        open(
          seal(SECRET, KEY_A, aadFor(ROW, 'account_number')),
          KEY_A,
          aadFor('6d3f1a2e-0000-4000-8000-000000000002', 'account_number')
        ),
    ],
    [
      'wrong column',
      () =>
        open(
          seal(SECRET, KEY_A, aadFor(ROW, 'account_number')),
          KEY_A,
          aadFor(ROW, 'routing_number')
        ),
    ],
    [
      'wrong key',
      () =>
        open(
          seal(SECRET, KEY_A, aadFor(ROW, 'account_number')),
          KEY_B,
          aadFor(ROW, 'account_number')
        ),
    ],
    ['not an envelope', () => open(SECRET, KEY_A, aadFor(ROW, 'account_number'))],
    ['key id of a bare value', () => keyIdOf(SECRET)],
    ['empty seal', () => seal('', KEY_A, aadFor(ROW, 'account_number'))],
  ]

  for (const [name, run] of failures) {
    it(`${name}: neither message nor stack contains the value`, () => {
      let caught: unknown
      try {
        run()
      } catch (e) {
        caught = e
      }
      assert.ok(caught instanceof Error, `${name} did not throw`)
      const err = caught as Error
      assert.ok(!err.message.includes(SECRET), 'message leaked the plaintext')
      assert.ok(!String(err.stack ?? '').includes(SECRET), 'stack leaked the plaintext')
      assert.ok(
        !JSON.stringify(err, Object.getOwnPropertyNames(err)).includes(SECRET),
        'serialised error leaked the plaintext'
      )
    })
  }
})
