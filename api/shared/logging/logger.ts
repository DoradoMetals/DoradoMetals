// The API's structured logger. One instance, imported everywhere a
// console.log used to be typed.
//
// WHAT IT WILL NEVER LOG, BY CONSTRUCTION. This process handles routing and
// account numbers (exchange.payouts, admin-only endpoints) and session
// cookies. So: no request or response BODIES ever reach a log line - the http
// middleware serializes method/url/status/duration and nothing else - and the
// redact list scrubs the credential-bearing headers if anything logs a raw
// req. CLAUDE.md's standing constraint ("never log bank details") is enforced
// here structurally, not by every call site remembering.
//
// Levels: LOG_LEVEL wins; tests are silent so suite output stays readable;
// production defaults to info; dev pretty-prints to the terminal.
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
