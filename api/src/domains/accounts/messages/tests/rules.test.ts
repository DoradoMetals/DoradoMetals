import { test } from 'vitest'
import assert from 'node:assert/strict'

import { emailsOf, maskNumber, messagesFor, numbersOf, smsPage } from '#accounts/messages/rules.ts'
import type { FakeMessage as FakeSms } from '#providers/twilio/fake.ts'

const sms = (patch: Partial<FakeSms> = {}): FakeSms => ({
  to: '+15125550199',
  from: '+15125550123',
  body: 'Your Dorado code is 481920. It expires in 10 minutes.',
  media: [],
  provider_sid: 'SMfake01',
  sent_at: '2026-10-13T14:05:00.000Z',
  ...patch,
})

test('the sms page draws the body in a bubble with the code emphasised', () => {
  const page = smsPage(sms())
  assert.match(page, /^<!doctype html>/)
  assert.match(page, /class="bubble"/)
  assert.match(page, /<strong class="code">481920<\/strong>/)
  assert.match(page, /Oct 13, 2026, 2:05 PM UTC/)
  assert.match(page, /To \+15125550199/)
})

test('the sms page masks the from-number to its last four digits', () => {
  const page = smsPage(sms())
  assert.ok(!page.includes('5125550123'), 'the full from-number never reaches the page')
  assert.match(page, /•••-0123/)
  assert.equal(maskNumber('12'), '•••')
})

test('the sms page is self-contained: inline css, no external asset or script', () => {
  const page = smsPage(sms())
  assert.match(page, /<style>/)
  assert.ok(!/<link\b|<script\b|src=|url\(/i.test(page))
})

test('the sms page escapes the body', () => {
  const page = smsPage(sms({ body: '<script>alert(1)</script> & "x"\nline two' }))
  assert.ok(!page.includes('<script>alert'))
  assert.match(page, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;x&quot;<br>line two/)
})

test('messages are filtered to the addressees and listed newest first across channels', () => {
  const list = messagesFor(
    [
      {
        to: 'pending@example.com',
        subject: 'Code',
        html: '<p>1</p>',
        message_id: 'fake-1@dorado.invalid',
        sent_at: '2026-10-13T14:00:00.000Z',
      },
      {
        to: 'other@example.com',
        subject: 'Other',
        html: '<p>2</p>',
        message_id: 'fake-2@dorado.invalid',
        sent_at: '2026-10-13T14:10:00.000Z',
      },
    ],
    [sms(), sms({ to: '+15125550142', provider_sid: 'SMfake02' })],
    emailsOf(null, 'Pending@Example.com '),
    numbersOf(null, '+1 (512) 555-0199')
  )
  assert.deepEqual(
    list.map((message) => message.message_id),
    ['SMfake01', 'fake-1@dorado.invalid']
  )
  assert.equal(list[0].subject, null)
  assert.match(list[0].preview ?? '', /481920/)
})
