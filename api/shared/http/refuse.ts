// A refusal that carries its status — errorHandler.ts only shows a message to the caller when the error carries a deliberate 4xx; a bare `new Error` becomes a generic 500 and the real reason only reaches the log.
// Was a private copy of the same three lines in three services; now one function shared by all.
// 400 malformed, 403 not yours, 404 doesn't exist, 409 current state forbids this.
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
