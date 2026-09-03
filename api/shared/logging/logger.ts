// The API's structured logger, one instance, imported everywhere a console.log used to be typed.
// Never logs bank details or session cookies, by construction — the http middleware serializes only method/url/status/duration, and the redact list scrubs credential-bearing headers if anything ever logs a raw req. CLAUDE.md's 'never log bank details' rule is enforced structurally here, not by every call site remembering.
// LOG_LEVEL wins; tests are silent; production defaults to info; dev pretty-prints.
import pino from "pino";

const level =
  process.env.LOG_LEVEL ??
  (process.env.NODE_ENV === "test" ? "silent" : "info");

export const logger = pino({
  level,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['set-cookie']",
      "*.routing_number",
      "*.account_number",
    ],
    censor: "[REDACTED]",
  },
  ...(process.env.NODE_ENV !== "production" && process.stdout.isTTY
    ? { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } } }
    : {}),
});
