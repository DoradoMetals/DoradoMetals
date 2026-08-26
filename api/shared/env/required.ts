// An environment variable a call cannot proceed without.
//
// WHY THIS EXISTS. Converting the providers surfaced two places where an unset
// variable was passed straight on:
//
//   params.append("secret", process.env.RECAPTCHA_SECRET_KEY)
//   stripeClient.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)
//
// URLSearchParams turns `undefined` into the literal string "undefined", so
// reCAPTCHA was being asked to verify against a secret spelled u-n-d-e-f-i-n-e-d
// and answering with its own generic failure. Nothing anywhere said which
// variable was missing.
//
// THE MESSAGE NAMES THE VARIABLE AND NEVER ITS VALUE. That is the whole
// discipline of this file: a missing secret must be diagnosable without any log
// line, exception or stack trace ever carrying the secret itself.
//
// This is NOT the boot-time validation FOLLOWUPS asks for - that decides which
// variables the process refuses to start without, and it is Jacob's call. This
// is the piece such a check would be built from, and it makes the two call
// sites above fail with a sentence instead of a puzzle.
export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set - this request cannot be made without it`
    );
  }
  return value;
}
