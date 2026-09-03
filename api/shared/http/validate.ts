// The transport boundary's validation helpers: strict zod parsing plus the uuid-shaped id check, sharing one refuse(400, ...) core.
import type { Request } from "express";
import { z, type ZodType } from "zod/v4";
import { refuseWith } from "#shared/http/refuse.ts";
import { param } from "#shared/http/caller.ts";

// A uuid-SHAPED id, not an RFC4122-COMPLIANT one. zod's own `.uuid()` checks
// the version/variant nibbles and refuses "11111111-1111-1111-1111-111111111111"
// - the all-ones id this codebase's tests use everywhere for "well-formed but
// names nothing" - as malformed input (400) rather than letting it reach the
// service to answer 404. Postgres's own `uuid` type is exactly this lenient
// (32 hex digits, dashed 8-4-4-4-12); matching that is what actually prevents
// "invalid input syntax for type uuid" without also rejecting a legitimate
// test fixture or a caller's deliberately-fake id. uuidParam/uuidField below
// test the same regex directly, so a param and a body field are held to the
// exact same standard as this schema.
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
export const uuidLike = z.string().regex(UUID_RE, "must be a uuid");

// The shared strict-parse-and-refuse core. A bare ZodError has no
// `statusCode`, so letting one reach shared/middleware/errorHandler.ts
// unwrapped answers a generic 500 rather than the 400 a malformed request
// deserves - errorHandler only shows the real message for an error "raised
// deliberately", which it tests by looking for that property. `subject`,
// when given, names the thing being parsed ("leads/create body", a query
// param name, ...); omitted, the message falls back to just the issue.
function strictParse<T>(schema: ZodType<T>, value: unknown, subject?: string): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  const issue = result.error.issues[0];
  const path = issue?.path?.join(".") ?? "";
  const detail = path ? `"${path}" ${issue!.message}` : (issue?.message ?? "is invalid");
  return refuseWith(400, subject ? `${subject}: ${detail}` : detail);
}

export function parseStrict<T>(schema: ZodType<T>, value: unknown, subject: string): T {
  return strictParse(schema, value, subject);
}

// The transport boundary's ONE validation point (CRUD-batch-3, Jacob's
// ruling): a controller parses its body against the contract's own zod schema
// in STRICT mode, once, before the service ever runs. The service then checks
// RULES only - never shapes - because the shape question is already answered
// by the time it is called.
export function strictBody<T>(schema: ZodType<T>, body: unknown): T {
  return strictParse(schema, body ?? {});
}

// The path-param half of the same rule: a route param is always a string
// until it is checked, and a malformed id must be a 400 naming the param
// rather than a query that runs and matches nothing.
export function uuidParam(req: { params: Record<string, unknown> }, name: string): string {
  const raw = param(req as Request, name);
  if (!UUID_RE.test(raw)) refuseWith(400, `"${name}" must be a uuid`);
  return raw;
}

// The body-field half: a value the route reads out of req.body rather than
// req.params. Used where no contract schema exists yet for the whole body
// (listed as a gap in the batch report) but the id still deserves the same
// 400-naming-the-field treatment as a malformed path param, rather than a
// query that runs and matches nothing.
export function uuidField(body: Record<string, unknown> | undefined, name: string): string {
  const raw = body?.[name];
  if (typeof raw !== "string" || !UUID_RE.test(raw)) refuseWith(400, `"${name}" must be a uuid`);
  return raw;
}
