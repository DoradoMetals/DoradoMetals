// The transport boundary's ONE validation point (CRUD-batch-3, Jacob's
// ruling): a controller parses its body against the contract's own zod schema
// in STRICT mode, once, before the service ever runs. The service then checks
// RULES only - never shapes - because the shape question is already answered
// by the time it is called.
//
// strictBody THROWS a refuse()-shaped 400 naming the first issue, rather than
// letting a ZodError reach errorHandler.ts: ZodError carries no `statusCode`,
// so an unconverted one would read as an unexpected 500 - the exact failure
// mode shared/http/refuse.ts exists to prevent.
//
// uuidParam is the path-id half of the same rule: a route param is always a
// string until it is checked, and a malformed id must be a 400 naming the
// param rather than a query that runs and matches nothing.
import type { Request } from "express";
import type { ZodType } from "zod/v4";
import { refuseWith } from "#shared/http/refuse.ts";
import { param } from "#shared/http/caller.ts";

export function strictBody<T>(schema: ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body ?? {});
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const path = issue?.path?.join(".") ?? "";
  return refuseWith(
    400,
    path ? `"${path}": ${issue!.message}` : (issue?.message ?? "the document is not valid")
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
