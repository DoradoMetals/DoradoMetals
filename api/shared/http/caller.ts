import type { Request } from "express";

// The caller's own id, or a refusal.
//
// requireUser sets req.user and nothing else does, so Express's Request type
// declares it optional - every handler gets the same type whether a guard ran
// or not. That is the honest description: a controller mounted without
// requireUser really would find it absent.
//
// This is the acknowledgement, in one place rather than a `!` in each handler.
// 401 rather than the TypeError's 500, for the reason the payments and
// sales-order services give: a missing session is an authentication fact, not a
// server fault. On a guarded route it never fires; if one is ever mounted
// without its guard, the caller is refused instead of reading `undefined.id`.
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

// A query parameter that the handler cannot proceed without.
//
// oneString narrows away the array and object forms Express really delivers;
// this turns "absent or malformed" into a 400 naming the parameter, rather than
// letting `undefined` reach a repo and become `WHERE id = NULL` - which matches
// nothing and answers as though the row simply did not exist.
export function requiredParam(value: unknown, name: string): string {
  const s = typeof value === "string" ? value : undefined;
  if (!s) {
    const err: Error & { statusCode?: number } = new Error(`${name} is required`);
    err.statusCode = 400;
    throw err;
  }
  return s;
}
