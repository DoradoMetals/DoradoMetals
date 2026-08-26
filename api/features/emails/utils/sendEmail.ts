import nodemailer from "nodemailer";
import { isTestRun } from "#shared/testing/is-test-run.ts";

// STRUCTURAL, NOT nodemailer.Transporter. The whole point of the `transport`
// parameter is that a test can pass something which records the message instead
// of sending it, and a recorder is an object with one method - not a
// Transporter, not close to one. Naming nodemailer's type here would reject
// every caller this seam exists for.
//
// The return is `unknown` rather than void because nodemailer returns a result
// and a caller may depend on it; the tests' recorder returns one for that
// reason.
type Transport = {
  sendMail: (message: Message) => Promise<unknown>;
};

type Attachment = {
  filename: string;
  content: Buffer | Uint8Array | string;
  contentType?: string;
};

type Message = {
  from?: string;
  to?: string | null;
  subject?: string;
  text?: string;
  html?: string;
  attachments?: Attachment[];
};

// The transport is built on first use, not at import.
//
// It used to be created at module load, so importing anything that reaches this
// file - which is most of the app, since features/auth/client.js sends
// verification mail - opened an SMTP transport. That happens in tests and in
// one-off scripts too, neither of which is ever going to send anything. Same
// reasoning as render/browser.ts, which launches Chromium lazily for exactly
// this reason.
let shared: Transport | null = null;

// A TEST RUN MUST NOT BE ABLE TO SEND REAL MAIL.
//
// .env carries live SMTP credentials, and the addresses this application sends
// to are real customers and real refiners. A replay suite that reaches
// sendEmail without passing a transport would post an order to Elemetal.
//
// Relying on every test remembering to pass a recorder is the same shape as a
// test that is only safe because the code under test throws first - it holds
// until someone writes the one that forgets. So the shared transport refuses to
// exist during a test run instead.
//
function sharedTransport(): Transport {
  // Asked HERE, not at module load. See shared/testing/is-test-run.ts - a
  // module-level const captures the environment before a script that sets
  // NODE_ENV itself has run, because imports are hoisted.
  if (isTestRun()) {
    throw new Error(
      "refusing to build the real mail transport during a test run.\n" +
        "Pass a transport: sendEmail(message, recorder). Nothing in a test may " +
        "reach a customer or a refiner."
    );
  }

  if (shared) return shared;

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || "587"),
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  // Wrapped rather than returned directly. nodemailer's sendMail is overloaded
  // with a callback form, so its type is not assignable to the one-argument,
  // promise-returning shape this module accepts from callers - and a cast
  // asserting they are the same would be claiming something untrue about a
  // signature. One line of adapter says it honestly instead.
  //
  // `to` is nullable here because it comes from user.user_email, which the wire
  // says is nullable; nodemailer will refuse an empty recipient itself, which
  // is a better place to find out than a type that pretends it cannot happen.
  //
  // The attachments cast is the one claim in this file, and it is checked
  // rather than asserted. @types/nodemailer declares an attachment's content as
  // `string | Buffer | Readable`, and every PDF this application sends is a
  // Uint8Array, because that is what puppeteer returns.
  //
  // The runtime is wider than the types, and not by accident: nodemailer writes
  // the content straight to a stream, and Node's stream layer accepts "string
  // or an instance of Buffer, TypedArray, or DataView" - which a Uint8Array is.
  // Passing an object that is none of those throws ERR_INVALID_ARG_TYPE from
  // node:internal/streams/writable, so the boundary is Node's, not nodemailer's.
  //
  // sendEmail.test.js pins it: the same message built both ways through
  // nodemailer's own stream transport produces byte-for-byte identical MIME,
  // and different bytes produce different MIME, so the comparison is not blind.
  //
  // Converting with Buffer.from would copy every byte of a multi-megabyte
  // document on every send to change nothing observable.
  const wrapped: Transport = {
    sendMail: (message: Message) =>
      transporter.sendMail({
        ...message,
        to: message.to ?? undefined,
        attachments: message.attachments as nodemailer.SendMailOptions["attachments"],
      }),
  };

  shared = wrapped;
  return wrapped;
}

// `transport` is optional and works the way `executor` does on a repo call: the
// caller passes one when it has a reason to, and everything else gets the
// shared one. A test passes a transport that records the message instead of
// sending it, which is the only way to assert on what would have gone out.
//
// It is a separate parameter rather than a field on the message, deliberately.
// The controllers hand `req.body` straight to the service, so a field would be
// reachable from the request.
export async function sendEmail(
  { to, subject, text, html, attachments = [] }: Message,
  transport?: Transport
) {
  return await (transport ?? sharedTransport()).sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    text,
    html,
    attachments,
  });
}
