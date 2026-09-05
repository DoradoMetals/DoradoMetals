import { test } from 'vitest'
import assert from 'node:assert/strict'
import nodemailer from 'nodemailer'
import { sendEmail } from '#providers/emails/nodemailer.ts'

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])

const composed = async (content: Uint8Array | string | Buffer) => {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true })
  const info: unknown = await transport.sendMail({
    from: 'from@example.com',
    to: 'to@example.com',
    subject: 'subject',
    html: '<p>body</p>',
    attachments: [
      { filename: 't.pdf', content, contentType: 'application/pdf' },
    ] as nodemailer.SendMailOptions['attachments'],
  })
  assert.ok(
    info && typeof info === 'object' && 'message' in info && info.message != null,
    'the stream transport returned no composed message - `buffer: true` is what puts it there'
  )
  return String(info.message)
    .replace(/_NmP-[0-9a-f]+-Part_\d+/g, 'BOUNDARY')
    .replace(/^Message-ID: .*$/m, 'Message-ID: NORMALISED')
    .replace(/^Date: .*$/m, 'Date: NORMALISED')
}

test('a Uint8Array attachment composes to the same bytes as a Buffer', async () => {
  const fromBytes = await composed(PDF_BYTES)
  const fromBuffer = await composed(Buffer.from(PDF_BYTES))

  assert.equal(
    fromBytes,
    fromBuffer,
    'nodemailer no longer treats a Uint8Array as binary - the cast in sendEmail.ts must become Buffer.from'
  )
  assert.ok(fromBytes.includes('JVBERi0xLjQ='), 'the attachment was not base64-encoded')
  assert.ok(
    fromBytes.includes('Content-Transfer-Encoding: base64'),
    'the attachment was not sent as binary'
  )
})

test("a caller's transport is used instead of the shared one", async () => {
  type SentMessage = {
    to?: unknown
    from?: unknown
    attachments?: { content?: unknown }[]
  }
  const sent: SentMessage[] = []
  const result = await sendEmail(
    {
      to: 'to@example.com',
      subject: 'subject',
      html: '<p>body</p>',
      attachments: [{ filename: 't.pdf', content: PDF_BYTES, contentType: 'application/pdf' }],
    },
    {
      sendMail: async (message) => {
        sent.push(message)
        return { messageId: 'recorded' }
      },
    }
  )

  assert.equal(sent.length, 1, 'the message did not reach the transport')
  const [message] = sent
  assert.equal(message.to, 'to@example.com')
  assert.equal(message.from, process.env.EMAIL_FROM, 'from is taken from the environment')
  const [attachment] = message.attachments ?? []
  assert.ok(attachment, 'the message reached the transport with no attachments')
  assert.equal(attachment.content, PDF_BYTES, 'the attachment was copied or dropped')
  assert.deepEqual(result, { messageId: 'recorded' }, "the transport's result was swallowed")
})
