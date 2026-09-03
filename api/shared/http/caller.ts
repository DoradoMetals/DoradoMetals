import type { Request } from "express";

// The caller's own id, or a 401 — requireUser is the only thing that sets req.user, so Express's type declares it optional; this is the one place that acknowledges it instead of a `!` in each handler. 401, not the TypeError's 500: a missing session is an authentication fact, not a server fault.
export function callerId(req: Request): string {
  const id = req.user?.id;
  if (!id) {
    const err: Error & { statusCode?: number } = new Error(
      "no session - this endpoint needs a signed-in caller"
    );
    err.statusCode = 401;
    throw err;
  }
  return id;
}

// Turns "absent or malformed" into a 400 naming the parameter, rather than letting undefined reach a repo as `WHERE id = NULL` (matches nothing, answers as though the row didn't exist).
// The route-param spelling of requiredParam, compact enough to inline:
//   param(req, "id")
// express 5 types req.params values as string | string[] (repeatable params),
// and this narrows to the single-string case or answers a clean 400.
export function param(req: { params: Record<string, unknown> }, name: string): string {
  return requiredParam(req.params[name], name);
}

export function requiredParam(value: unknown, name: string): string {
  const s = typeof value === "string" ? value : undefined;
  if (!s) {
    const err: Error & { statusCode?: number } = new Error(`${name} is required`);
    err.statusCode = 400;
    throw err;
  }
  return s;
}
