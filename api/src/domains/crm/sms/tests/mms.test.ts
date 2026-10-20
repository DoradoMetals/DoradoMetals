// RULING 161: MESSAGES CARRY PICTURES BOTH WAYS.
//
// Outbound: POST /api/sms takes `image_ids` (media.images ids, from the compose
// row's paperclip upload) beside the existing `media` url list. The provider
// is sent a media URL per image, and crm.sms_message_images links each image
// to the stored message.
//
// Inbound: the Twilio webhook with NumMedia=1 and MediaUrl0 writes one
// media.images row and links it to the stored message. No network is reached
// at webhook time (shared/testing/no-network.ts refuses it, and no Twilio
// cassette exists), so the row records the Twilio media and the bytes are
// fetched, if ever, outside the webhook.
//
// The thread read (GET /api/sms) answers SmsMessageView: the row plus
// `image_ids`, on both directions.
//
// The provider is the house fake (SMS_PROVIDER unset), which keeps an outbox;
// that outbox stands where a cassette would.
import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { SmsMessageView, SmsSendBody, SmsThreadMessage } from '@dorado/contracts'
import * as fake from '#providers/twilio/fake.ts'
import { mockSessions, restoreSessions, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aLead, aTag, anUnknownId } from '#shared/testing/builders/index.ts'
import * as images from '#db/media/images/repo.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const inCrm = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: LOCKS.USERS })

let numbers = 0
const aPhone = (): string =>
  `+1512557${String((numbers += 1) * 37 + Math.floor(Math.random() * 30))
    .padStart(4, '0')
    .slice(-4)}`

const anImage = async (c: PoolClient, name: string) =>
  await images.create(
    {
      user_id: TEST_ACTOR.id,
      bucket: 'test-bucket',
      path: `${TEST_ACTOR.id}/`,
      filename: name,
      mime_type: 'image/jpeg',
    },
    c
  )

function inboundForm(from: string, over: Record<string, string> = {}): Record<string, string> {
  return {
    MessageSid: `SMmms${aTag()}${String(Date.now()).slice(-8)}`,
    From: from,
    To: '+15125550000',
    Body: 'here is the ring',
    NumMedia: '1',
    MediaUrl0: `https://api.twilio.com/2010-04-01/Accounts/AC0/Messages/MM0/Media/ME${aTag()}`,
    MediaContentType0: 'image/jpeg',
    ...over,
  }
}

const linkedImages = async (c: PoolClient, message_id: string) =>
  (
    await c.query<{ image_id: string; mime_type: string }>(
      `SELECT l.image_id, i.mime_type
         FROM crm.sms_message_images l
         JOIN media.images i ON i.id = l.image_id
        WHERE l.message_id = $1
        ORDER BY l.sort_order`,
      [message_id]
    )
  ).rows

test('outbound: image_ids send a media url per image and link the images to the message', async () => {
  await inCrm(async (c) => {
    const lead = await aLead(c, { phone: aPhone() })
    const photo = await anImage(c, 'quote-photo.jpg')
    const body: SmsSendBody = {
      lead_id: lead.id,
      body: 'the piece we discussed',
      image_ids: [photo.id],
    }

    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app).post('/api/sms').send(body)
      assert.equal(res.status, 201, res.text)
      const sent = SmsMessageView.parse(res.body)
      assert.equal(sent.direction, 'outbound')
      assert.deepEqual(sent.image_ids, [photo.id])

      const out = fake.lastMessageTo(lead.phone!)
      assert.ok(out, 'nothing reached the provider')
      assert.equal(out.media.length, 1, 'the provider was not given the image')
      assert.match(out.media[0]!.url, /quote-photo\.jpg/, 'the media url does not name the image')
      assert.equal(out.media[0]!.content_type, 'image/jpeg')

      assert.deepEqual(
        (await linkedImages(c, sent.id)).map((r) => r.image_id),
        [photo.id],
        'crm.sms_message_images does not link the image to the message'
      )
    })
  })
})

test('outbound: an image id that names no image is refused with 422 and nothing is sent', async () => {
  await inCrm(async (c) => {
    const lead = await aLead(c, { phone: aPhone() })
    const before = fake.sent().length
    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app)
        .post('/api/sms')
        .send({ lead_id: lead.id, body: 'hi', image_ids: [anUnknownId()] })
      assert.equal(res.status, 422, res.text)
    })
    assert.equal(fake.sent().length, before, 'a refused send still reached the provider')
  })
})

test('outbound: image_ids that are not uuids are refused with 400', async () => {
  await inCrm(async (c) => {
    const lead = await aLead(c, { phone: aPhone() })
    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app)
        .post('/api/sms')
        .send({ lead_id: lead.id, body: 'hi', image_ids: ['not-a-uuid'] })
      assert.equal(res.status, 400, res.text)
    })
  })
})

test('inbound: NumMedia=1 stores one media.images row and links it to the message', async () => {
  await inCrm(async (c) => {
    const phone = aPhone()
    await aLead(c, { phone })
    const form = inboundForm(phone)

    const res = await request(app).post('/api/sms/inbound').type('form').send(form)
    assert.equal(res.status, 200, res.text)

    const { rows } = await c.query<{ id: string }>(
      'SELECT id FROM crm.sms_messages WHERE provider_sid = $1',
      [form.MessageSid]
    )
    assert.equal(rows.length, 1, 'the inbound message was not stored')
    const linked = await linkedImages(c, rows[0]!.id)
    assert.equal(linked.length, 1, 'the inbound picture was not stored and linked')
    assert.equal(linked[0]!.mime_type, 'image/jpeg')

    const stored = await images.getOne(linked[0]!.image_id, c)
    assert.ok(stored, 'the linked image row is missing')
    assert.equal(stored.bucket, process.env.S3_BUCKET, 'the picture is not in our bucket')
    assert.ok(!stored.path.includes('twilio.com'), 'the row points at Twilio, not our copy')
    assert.match(stored.checksum ?? '', /^[0-9a-f]{64}$/, 'the stored bytes carry no checksum')
    assert.ok((stored.size_bytes ?? 0) > 0, 'the stored bytes carry no size')
    assert.ok(fake.fetchedMedia().includes(form.MediaUrl0!), 'the provider never fetched the media')
  })
})

test('the link is unique per message and position at the database', async () => {
  await inCrm(async (c) => {
    const phone = aPhone()
    const form = inboundForm(phone)
    assert.equal((await request(app).post('/api/sms/inbound').type('form').send(form)).status, 200)
    const { rows } = await c.query<{ id: string }>(
      'SELECT id FROM crm.sms_messages WHERE provider_sid = $1',
      [form.MessageSid]
    )
    const other = await anImage(c, 'second-delivery.jpg')
    await c.query(
      `INSERT INTO crm.sms_message_images (message_id, image_id, sort_order)
       VALUES ($1, $2, 0) ON CONFLICT DO NOTHING`,
      [rows[0]!.id, other.id]
    )
    assert.equal((await linkedImages(c, rows[0]!.id)).length, 1, 'a second link took position 0')
  })
})

test('inbound: a replayed MMS webhook links its image once, not twice', async () => {
  await inCrm(async (c) => {
    const phone = aPhone()
    const form = inboundForm(phone)
    for (let i = 0; i < 2; i += 1) {
      const res = await request(app).post('/api/sms/inbound').type('form').send(form)
      assert.equal(res.status, 200, `attempt ${i}: ${res.text}`)
    }
    const { rows } = await c.query<{ n: number; images: number }>(
      `SELECT count(DISTINCT m.id)::int AS n, count(l.image_id)::int AS images
         FROM crm.sms_messages m
         LEFT JOIN crm.sms_message_images l ON l.message_id = m.id
        WHERE m.provider_sid = $1`,
      [form.MessageSid]
    )
    assert.equal(rows[0]!.n, 1)
    assert.equal(rows[0]!.images, 1, 'a replayed webhook stored a second image')
    assert.equal(
      fake.fetchedMedia().filter((u) => u === form.MediaUrl0).length,
      1,
      'a replayed webhook fetched the media again'
    )
    const { rows: copies } = await c.query<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM media.images i
        WHERE i.checksum = (SELECT s.checksum
                              FROM crm.sms_message_images l
                              JOIN crm.sms_messages m ON m.id = l.message_id
                              JOIN media.images s ON s.id = l.image_id
                             WHERE m.provider_sid = $1)`,
      [form.MessageSid]
    )
    assert.equal(copies[0]!.n, 1, 'a replayed webhook wrote a second image row')
  })
})

test('inbound: a text with NumMedia=0 links no image', async () => {
  await inCrm(async (c) => {
    const phone = aPhone()
    const form = inboundForm(phone, { NumMedia: '0' })
    delete form.MediaUrl0
    delete form.MediaContentType0
    const res = await request(app).post('/api/sms/inbound').type('form').send(form)
    assert.equal(res.status, 200, res.text)
    const { rows } = await c.query<{ id: string }>(
      'SELECT id FROM crm.sms_messages WHERE provider_sid = $1',
      [form.MessageSid]
    )
    assert.deepEqual(await linkedImages(c, rows[0]!.id), [])
  })
})

test('the thread read carries image ids on both directions', async () => {
  await inCrm(async (c) => {
    const phone = aPhone()
    const lead = await aLead(c, { phone })
    const photo = await anImage(c, 'outbound.jpg')

    await asAdmin(TEST_ACTOR, async () => {
      const sent = await request(app)
        .post('/api/sms')
        .send({ lead_id: lead.id, body: 'ours', image_ids: [photo.id] })
      assert.equal(sent.status, 201, sent.text)
    })

    const form = inboundForm(phone)
    assert.equal((await request(app).post('/api/sms/inbound').type('form').send(form)).status, 200)

    await asAdmin(TEST_ACTOR, async () => {
      const thread = await request(app).get('/api/sms').query({ number: phone })
      assert.equal(thread.status, 200, thread.text)
      const rows = thread.body.map((r: unknown) => SmsMessageView.parse(r))
      const outbound = rows.find((r: SmsMessageView) => r.direction === 'outbound')
      const inbound = rows.find((r: SmsMessageView) => r.direction === 'inbound')
      assert.ok(outbound && inbound, 'the thread is missing a direction')
      assert.deepEqual(outbound.image_ids, [photo.id])
      assert.equal(inbound.image_ids.length, 1, 'the inbound bubble carries no image id')
      assert.notEqual(inbound.image_ids[0], photo.id)
    })
  })
})

test('a message with no pictures reads image_ids as an empty list, never null', async () => {
  await inCrm(async (c) => {
    const lead = await aLead(c, { phone: aPhone() })
    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app).post('/api/sms').send({ lead_id: lead.id, body: 'plain' })
      assert.equal(res.status, 201, res.text)
      assert.deepEqual(SmsMessageView.parse(res.body).image_ids, [])
    })
  })
})

test('the thread read carries each message images as id and a signed url', async () => {
  await inCrm(async (c) => {
    const lead = await aLead(c, { phone: aPhone() })
    const photo = await anImage(c, 'thread-photo.jpg')
    await asAdmin(TEST_ACTOR, async () => {
      const sent = await request(app)
        .post('/api/sms')
        .send({ lead_id: lead.id, body: 'look', image_ids: [photo.id] })
      assert.equal(sent.status, 201, sent.text)
      const thread = await request(app).get('/api/sms').query({ number: lead.phone })
      assert.equal(thread.status, 200, thread.text)
      const rows = thread.body.map((row: unknown) => SmsThreadMessage.parse(row))
      const mine = rows.find((row: SmsThreadMessage) => row.id === sent.body.id)
      assert.ok(mine, 'the sent message is not in the thread')
      assert.deepEqual(
        Array.from(mine.images, (image: { id: string }) => image.id),
        [photo.id]
      )
      assert.match(mine.images[0].url, /thread-photo\.jpg/)
      const plain = rows.find((row: SmsThreadMessage) => row.image_ids.length === 0)
      if (plain) assert.deepEqual(plain.images, [])
    })
  })
})
