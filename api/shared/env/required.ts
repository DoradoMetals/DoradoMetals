// An environment variable a call cannot proceed without. Converting the providers surfaced two places passing an unset variable straight on — URLSearchParams turns undefined into the literal string "undefined", so reCAPTCHA verified against a secret spelled u-n-d-e-f-i-n-e-d with no indication which variable was missing.
// The message names the variable and NEVER its value — a missing secret must be diagnosable without a log line, exception or stack trace ever carrying the secret itself.
// Not the boot-time validation FOLLOWUPS asks for (that's Jacob's call) — this is the piece such a check would be built from.
export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set - this request cannot be made without it`
    );
  }
  return value;
}
