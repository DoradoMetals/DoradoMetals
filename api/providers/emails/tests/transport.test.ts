// Checks nodemailer.ts's one real claim: @types/nodemailer declares an attachment's content as string | Buffer | Readable, but every PDF here is a Uint8Array (what puppeteer returns) — the wrapper casts it through, and this proves the cast is safe rather than assuming it.
// Both messages are built through nodemailer's own stream transport (real MailComposer, nothing sent — streamTransport writes to a buffer), so a Uint8Array and a Buffer must compose to identical bytes. If this ever goes red, the cast has to become Buffer.from (which copies every byte of a multi-megabyte document — why it's a cast today, not a conversion).
import test from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";
import { sendEmail } from "#providers/emails/nodemailer.ts";

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

const composed = async (content: Uint8Array | string | Buffer) => {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  // Two @types/nodemailer gaps, both narrowed rather than cast away: (1) content really is a Uint8Array here, matching the same claim nodemailer.ts casts on; (2) SentMessageInfo resolves to `void`, so the composed MIME text (only present under streamTransport+buffer) is checked at runtime instead of assumed.
  const info: unknown = await transport.sendMail({
    from: "from@example.com",
    to: "to@example.com",
    subject: "subject",
    html: "<p>body</p>",
    attachments: [
      { filename: "t.pdf", content, contentType: "application/pdf" },
    ] as nodemailer.SendMailOptions["attachments"],
  });
  // Three things differ between any two messages by design: the Message-ID, the MIME boundary, and the DATE — the date caused a real flake once (two composes straddling a second boundary). Normalising all three keeps the comparison about the attachment, the only thing this test is for.
  assert.ok(
    info && typeof info === "object" && "message" in info && info.message != null,
    "the stream transport returned no composed message - `buffer: true` is what puts it there"
  );
  return String(info.message)
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
  // The messages the fake transport received. Declared as the subset the
  // assertions read rather than left to infer from a push inside a closure.
  type SentMessage = {
    to?: unknown;
    from?: unknown;
    attachments?: { content?: unknown }[];
  };
  const sent: SentMessage[] = [];
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
  const [message] = sent;
  assert.equal(message.to, "to@example.com");
  assert.equal(message.from, process.env.EMAIL_FROM, "from is taken from the environment");
  const [attachment] = message.attachments ?? [];
  assert.ok(attachment, "the message reached the transport with no attachments");
  assert.equal(attachment.content, PDF_BYTES, "the attachment was copied or dropped");
  assert.deepEqual(result, { messageId: "recorded" }, "the transport's result was swallowed");
});
