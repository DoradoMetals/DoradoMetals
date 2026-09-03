// STRICT request validation, thin wrapper around zod.
//
// A bare ZodError has no `statusCode`, so letting one reach
// shared/middleware/errorHandler.ts unwrapped answers a generic 500 rather
// than the 400 a malformed request deserves - errorHandler only shows the
// real message for an error "raised deliberately", which it tests by looking
// for that property. This converts the first issue into a `refuse(400, ...)`
// so the caller sees what was wrong rather than "Server error".
import { z, type ZodType } from "zod/v4";
import { refuse } from "#shared/http/refuse.ts";

// A uuid-SHAPED id, not an RFC4122-COMPLIANT one. zod's own `.uuid()` checks
// the version/variant nibbles and refuses "11111111-1111-1111-1111-111111111111"
// - the all-ones id this codebase's tests use everywhere for "well-formed but
// names nothing" - as malformed input (400) rather than letting it reach the
// service to answer 404. Postgres's own `uuid` type is exactly this lenient
// (32 hex digits, dashed 8-4-4-4-12); matching that is what actually prevents
// "invalid input syntax for type uuid" without also rejecting a legitimate
// test fixture or a caller's deliberately-fake id.
export const uuidLike = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, "must be a uuid");

export function parseStrict<T>(schema: ZodType<T>, value: unknown, subject: string): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  const issue = result.error.issues[0];
  const path = issue?.path?.join(".") ?? "";
  const detail = path ? `"${path}" ${issue!.message}` : (issue?.message ?? "is invalid");
  throw refuse(400, `${subject}: ${detail}`);
}
