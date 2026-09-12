import { test, afterEach } from 'vitest'
import assert from 'node:assert/strict'
import {
  assertSendable,
  configured,
  messageIdFrom,
  refusalFrom,
  requestBody,
  tagsFor,
} from '#providers/communications/email/resend.ts'
import * as email from '#providers/communications/email/index.ts'

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

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])

test('a message becomes the documented POST /emails body', () => {
  assert.deepEqual(
    requestBody({
      from: 'Dorado Metals Exchange <orders@doradometals.com>',
      to: 'customer@example.com',
      subject: 'Your order',
      html: '<p>body</p>',
      text: 'body',
      tags: [{ name: 'kind', value: 'purchase_order_created' }],
    }),
    {
      from: 'Dorado Metals Exchange <orders@doradometals.com>',
      to: ['customer@example.com'],
      subject: 'Your order',
      html: '<p>body</p>',
      text: 'body',
      tags: [{ name: 'kind', value: 'purchase_order_created' }],
    }
  )
})

test('an attachment travels as base64, and empty fields are left out', () => {
  const body = requestBody({
    from: 'a@b.test',
    to: 'c@d.test',
    subject: 's',
    html: '<p>x</p>',
    attachments: [{ filename: 'packing_list.pdf', content: PDF, contentType: 'application/pdf' }],
  })
  assert.deepEqual(body.attachments, [
    { filename: 'packing_list.pdf', content: 'JVBERi0xLjQ=', content_type: 'application/pdf' },
  ])
  assert.equal('text' in body, false, 'an absent text part was sent as an empty string')
  assert.equal('tags' in body, false, 'an empty tag list was sent')
})

test('a tag is reduced to the characters Resend accepts', () => {
  assert.deepEqual(tagsFor([{ name: 'kind', value: 'sales order/created' }]), [
    { name: 'kind', value: 'sales_order_created' },
  ])
})

test('the id of an accepted send is the message id; anything else is none', () => {
  assert.equal(
    messageIdFrom({ id: '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794' }),
    '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794'
  )
  assert.equal(messageIdFrom({ id: '' }), null)
  assert.equal(messageIdFrom(null), null)
})

test('a refusal reads as the failure the paper trail records', () => {
  assert.match(
    refusalFrom(422, { name: 'validation_error', message: 'The domain is not verified' }),
    /422 validation_error - The domain is not verified/
  )
  assert.match(refusalFrom(500, null), /500 error - no message/)
})

test('Resend is selected when its key is set, ahead of SMTP', () => {
  set('NODE_ENV', 'development')
  set('RESEND_API_KEY', 're_test_key')
  set('EMAIL_HOST', 'smtp.example.test')
  assert.equal(configured(), true)
  assert.equal(email.selected(), 'resend')
  assert.equal(email.isFake(), false)
})

test('with no key the selection is unchanged: SMTP if EMAIL_HOST, else the fake', () => {
  set('NODE_ENV', 'development')
  set('RESEND_API_KEY', undefined)
  set('EMAIL_HOST', 'smtp.example.test')
  assert.equal(email.selected(), 'smtp')
  set('EMAIL_HOST', undefined)
  assert.equal(email.selected(), 'fake')
})

test('a test run still selects the fake, key or no key', () => {
  set('NODE_ENV', 'test')
  set('RESEND_API_KEY', 're_test_key')
  assert.equal(email.selected(), 'fake')
})

test('production refuses Resend without a verified sending domain', () => {
  set('NODE_ENV', 'production')
  set('RESEND_API_KEY', 're_test_key')
  set('RESEND_FROM_DOMAIN', undefined)
  set('EMAIL_FROM', 'Dorado <orders@doradometals.com>')
  assert.throws(() => assertSendable(), /RESEND_FROM_DOMAIN/)
})

test('production refuses a From that is not on the verified domain', () => {
  set('NODE_ENV', 'production')
  set('RESEND_FROM_DOMAIN', 'doradometals.com')
  set('EMAIL_FROM', 'Dorado <orders@somewhere-else.com>')
  assert.throws(() => assertSendable(), /is not on the verified domain/)
})

test('production accepts the verified domain and a subdomain of it', () => {
  set('NODE_ENV', 'production')
  set('RESEND_FROM_DOMAIN', 'doradometals.com')
  set('EMAIL_FROM', 'Dorado Metals Exchange <orders@doradometals.com>')
  assert.doesNotThrow(() => assertSendable())
  set('EMAIL_FROM', 'orders@mail.doradometals.com')
  assert.doesNotThrow(() => assertSendable())
})

test('outside production the domain is not demanded', () => {
  set('NODE_ENV', 'development')
  set('RESEND_FROM_DOMAIN', undefined)
  set('EMAIL_FROM', 'anything@example.test')
  assert.doesNotThrow(() => assertSendable())
})
