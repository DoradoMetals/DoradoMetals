// The one claim sendEmail.ts makes about a library, checked instead of asserted.
//
// @types/nodemailer declares an attachment's `content` as
// `string | Buffer | Readable`. Every PDF this application sends is a
// Uint8Array, because that is what puppeteer returns - features/pdf's own tests
// say so, and the controller relies on it too. So the wrapper in sendEmail.ts
// casts the attachments through, and a cast is a claim about behaviour rather
// than a fact about it.
//
// This is the fact. Both messages are built through nodemailer's own stream
// transport, which runs the real MailComposer and produces the bytes that would
// go on the wire. Nothing is sent: streamTransport writes to a buffer.
//
// The runtime is wider than the types on purpose. nodemailer writes the content
// straight to a stream, and Node's stream layer accepts "string or an instance
// of Buffer, TypedArray, or DataView" - a Uint8Array is a TypedArray. Passing
// an object that is none of those throws ERR_INVALID_ARG_TYPE from
// node:internal/streams/writable, so the boundary belongs to Node rather than
// to nodemailer, and is unlikely to move.
//
// If it ever does, this goes red and the cast in sendEmail.ts has to become a
// Buffer.from - which copies every byte of a multi-megabyte document, and is
// why it is a cast today.
//
// Checked for blindness: composing different bytes produces different MIME, so
// the comparison below is looking at the attachment and not just at the
// envelope.
import test from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";
import { sendEmail } from "#features/emails/utils/sendEmail.ts";

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

const composed = async (content) => {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const info = await transport.sendMail({
    from: "from@example.com",
    to: "to@example.com",
    subject: "subject",
    html: "<p>body</p>",
    attachments: [{ filename: "t.pdf", content, contentType: "application/pdf" }],
  });
  // THREE things differ between any two messages by design, and the third cost
  // a flaky failure: the Message-ID, the MIME boundary - which appears both in
  // the Content-Type header and as the part separator, in two different dash
  // forms - and the DATE, which is the wall clock at compose time.
  //
  // The date was missed because it does not look random the way a uuid does.
  // It is: these two messages are built one after the other, and the pair
  // straddles a second boundary whenever the tick lands between them. The test
  // passed on every run until it did not.
  //
  // Normalising all three is what leaves the comparison about the attachment,
  // which is the only thing this test is for.
  return info.message
    .toString()
    .replace(/_NmP-[0-9a-f]+-Part_\d+/g, "BOUNDARY")
    .replace(/^Message-ID: .*$/m, "Message-ID: NORMALISED")
    .replace(/^Date: .*$/m, "Date: NORMALISED");
};

test("a Uint8Array attachment composes to the same bytes as a Buffer", async () => {
  const fromBytes = await composed(PDF_BYTES);
  const fromBuffer = await composed(Buffer.from(PDF_BYTES));

  assert.equal(
    fromBytes,
    fromBuffer,
    "nodemailer no longer treats a Uint8Array as binary - the cast in sendEmail.ts must become Buffer.from"
  );
  // And it really encoded the bytes, rather than both producing the same
  // nothing: %PDF-1.4 in base64.
  assert.ok(fromBytes.includes("JVBERi0xLjQ="), "the attachment was not base64-encoded");
  assert.ok(
    fromBytes.includes("Content-Transfer-Encoding: base64"),
    "the attachment was not sent as binary"
  );
});

// The seam itself: a transport passed in is used, and the shared one - which
// would open a real SMTP connection using the credentials in .env - is not
// built at all.
test("a caller's transport is used instead of the shared one", async () => {
  const sent = [];
  const result = await sendEmail(
    {
      to: "to@example.com",
      subject: "subject",
      html: "<p>body</p>",
      attachments: [{ filename: "t.pdf", content: PDF_BYTES, contentType: "application/pdf" }],
    },
    {
      sendMail: async (message) => {
        sent.push(message);
        return { messageId: "recorded" };
      },
    }
  );

  assert.equal(sent.length, 1, "the message did not reach the transport");
  assert.equal(sent[0].to, "to@example.com");
  assert.equal(sent[0].from, process.env.EMAIL_FROM, "from is taken from the environment");
  assert.equal(sent[0].attachments[0].content, PDF_BYTES, "the attachment was copied or dropped");
  assert.deepEqual(result, { messageId: "recorded" }, "the transport's result was swallowed");
});
