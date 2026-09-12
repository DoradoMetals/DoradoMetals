import { test } from 'vitest'
import assert from 'node:assert/strict'

import { parseInbound, parseStatus } from '#providers/communications/twilio/sms.ts'

const inboundForm = {
  ToCountry: 'US',
  ToState: 'TX',
  SmsMessageSid: 'SM8a1b2c3d4e5f60718293a4b5c6d7e8f9',
  NumMedia: '0',
  ToCity: 'AUSTIN',
  FromZip: '78701',
  SmsSid: 'SM8a1b2c3d4e5f60718293a4b5c6d7e8f9',
  FromState: 'TX',
  SmsStatus: 'received',
  FromCity: 'AUSTIN',
  Body: 'Is my order shipped yet?',
  FromCountry: 'US',
  To: '+15125550134',
  MessagingServiceSid: 'MG0011223344556677889900aabbccddee',
  ToZip: '78701',
  NumSegments: '1',
  MessageSid: 'SM8a1b2c3d4e5f60718293a4b5c6d7e8f9',
  AccountSid: 'AC0011223344556677889900aabbccddee',
  From: '+15125550199',
  ApiVersion: '2010-04-01',
}

const mmsForm = {
  ...inboundForm,
  NumMedia: '2',
  Body: 'here are the coins',
  MediaContentType0: 'image/jpeg',
  MediaUrl0:
    'https://api.twilio.com/2010-04-01/Accounts/AC0011223344556677889900aabbccddee/Messages/SM8a1b2c3d4e5f60718293a4b5c6d7e8f9/Media/ME1111',
  MediaContentType1: 'image/png',
  MediaUrl1:
    'https://api.twilio.com/2010-04-01/Accounts/AC0011223344556677889900aabbccddee/Messages/SM8a1b2c3d4e5f60718293a4b5c6d7e8f9/Media/ME2222',
}

const statusForm = {
  SmsSid: 'SM8a1b2c3d4e5f60718293a4b5c6d7e8f9',
  SmsStatus: 'delivered',
  MessageStatus: 'delivered',
  To: '+15125550199',
  MessageSid: 'SM8a1b2c3d4e5f60718293a4b5c6d7e8f9',
  AccountSid: 'AC0011223344556677889900aabbccddee',
  From: '+15125550134',
  ApiVersion: '2010-04-01',
}

test('an inbound text parses to the row the log needs', () => {
  assert.deepEqual(parseInbound(inboundForm), {
    provider_sid: 'SM8a1b2c3d4e5f60718293a4b5c6d7e8f9',
    from_number: '+15125550199',
    to_number: '+15125550134',
    body: 'Is my order shipped yet?',
    media: [],
  })
})

test('NumMedia=2 yields both url and content-type pairs, in order', () => {
  const parsed = parseInbound(mmsForm)
  assert.equal(parsed.media.length, 2)
  assert.deepEqual(parsed.media[0], {
    url: mmsForm.MediaUrl0,
    content_type: 'image/jpeg',
  })
  assert.deepEqual(parsed.media[1], {
    url: mmsForm.MediaUrl1,
    content_type: 'image/png',
  })
})

test('a missing NumMedia is no media, not a crash', () => {
  const { NumMedia, ...without } = inboundForm
  assert.deepEqual(parseInbound(without).media, [])
  assert.deepEqual(parseInbound({ ...inboundForm, NumMedia: 'x' }).media, [])
})

test('a status callback parses status and a null error code', () => {
  assert.deepEqual(parseStatus(statusForm), {
    provider_sid: 'SM8a1b2c3d4e5f60718293a4b5c6d7e8f9',
    status: 'delivered',
    error_code: null,
  })
})

test('a failed status carries its error code', () => {
  const failed = { ...statusForm, MessageStatus: 'undelivered', ErrorCode: '30006' }
  assert.deepEqual(parseStatus(failed), {
    provider_sid: 'SM8a1b2c3d4e5f60718293a4b5c6d7e8f9',
    status: 'undelivered',
    error_code: '30006',
  })
})

test('SmsSid and SmsStatus stand in when the Message* fields are absent', () => {
  const legacy = { SmsSid: 'SMlegacy', SmsStatus: 'sent' }
  assert.deepEqual(parseStatus(legacy), {
    provider_sid: 'SMlegacy',
    status: 'sent',
    error_code: null,
  })
})
