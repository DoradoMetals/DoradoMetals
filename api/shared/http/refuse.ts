// A refusal that carries its status.
//
// shared/middleware/errorHandler.ts shows a message to the caller only when the
// error carries a deliberate 4xx - "an error raised deliberately is different:
// it was written to be read, and its status says so". A bare `new Error`
// arrives as a generic 500 "Server error" and the explanation goes to the log
// instead of to the admin who needed it.
//
// This lived as a private copy in features/fulfillments/service.ts,
// features/orders/patch.service.ts and features/checkout/service.ts, each with
// the same three lines and the same comment. It is one function; the per-
// resource services created by the 26c factoring would have made it five.
//
// 400 for "that request is malformed", 403 for "not yours", 404 for "that does
// not exist", 409 for "the current state forbids this".
export interface HttpError extends Error {
  statusCode?: number;
}

export function refuse(status: number, message: string): HttpError {
  const err: HttpError = new Error(message);
  err.statusCode = status;
  return err;
}

// The throwing form, for the call sites that read better as a statement.
// `never` so TypeScript narrows after it the way it does after a `throw`.
export function refuseWith(status: number, message: string): never {
  throw refuse(status, message);
}
