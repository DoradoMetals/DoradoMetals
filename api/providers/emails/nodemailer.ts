// The mail transport. An adapter to something outside the domain, which is why
// it lives here rather than in features/emails: this decides how a message
// leaves the building, the feature decides which message to send and what it
// says. Changing mail provider should touch this file and no template.
import nodemailer from "nodemailer";
import { isTestRun } from "#shared/testing/is-test-run.ts";

// Structural, not nodemailer.Transporter — the whole point of the `transport` param is that a test can pass a one-method recorder instead; naming nodemailer's own type would reject it.
// Exported so callers threading it through (features/emails/service.ts) can name it instead of restating the shape — restating a structural type is how a seam narrows by accident.
export type Transport = {
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

// Built on first use, not at import — creating it at module load meant importing almost anything (auth sends verification mail) opened a real SMTP transport, including in tests and one-off scripts that never send anything (same reasoning as puppeteer.ts's lazy Chromium).
let shared: Transport | null = null;

// A test run must not be able to send real mail — .env carries live SMTP credentials to real customers and refiners, and a replay test reaching sendEmail without a recorder would post an order to a real refiner.
// Relying on every test remembering to pass one is the same fragile shape as a test whose safety depends on code failing first — so the shared transport refuses to exist during a test run instead.
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

  // Wrapped, not returned directly — nodemailer's sendMail is overloaded with a callback form, so its type doesn't match this module's one-argument, promise-returning shape; a cast would claim something untrue.
  // `to` is nullable because it comes from user.user_email, itself nullable on the wire — nodemailer refuses an empty recipient itself, a better place to find out than a type that pretends it can't happen.
  // The attachments cast is the one real claim here, and it's checked: every PDF sent is a Uint8Array (from puppeteer), and @types/nodemailer only declares string | Buffer | Readable — but Node's stream layer accepts any TypedArray, so the boundary is Node's, not nodemailer's. sendEmail.test.ts pins byte-for-byte identical MIME output either way; Buffer.from would just copy a multi-megabyte document on every send to change nothing.
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

// `transport` works like `executor` on a repo call — optional, and everything without one gets the shared transport; a test passes a recorder to assert what would have gone out.
// A separate parameter, not a field on the message, because controllers hand req.body straight to the service — a field would be reachable from the request.
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
