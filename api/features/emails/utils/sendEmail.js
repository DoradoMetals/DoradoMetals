import nodemailer from "nodemailer";

// The transport is built on first use, not at import.
//
// It used to be created at module load, so importing anything that reaches this
// file - which is most of the app, since features/auth/client.js sends
// verification mail - opened an SMTP transport. That happens in tests and in
// one-off scripts too, neither of which is ever going to send anything. Same
// reasoning as render/browser.js, which launches Chromium lazily for exactly
// this reason.
let shared = null;

function sharedTransport() {
  if (!shared) {
    shared = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT || "587"),
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  }
  return shared;
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
  { to, subject, text, html, attachments = [] },
  transport
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
