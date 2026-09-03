// THE DOMAIN'S OWN REFUSALS. A use case says what is wrong with the request in
// the language of the business - this order does not exist, this metal cannot
// be priced, this intent already paid for something - and never in the language
// of HTTP.
//
// WHY THIS FILE EXISTS (Jacob, 2026-09-03, D214 item 11): seventeen domain
// files called `refuse(404, ...)`. A status code is a transport fact, so every
// one of them was a domain file reaching through the layer below it, and a
// second caller - a job, a script, another service - had to read status codes
// to find out what happened.
//
// Express 5 passes a thrown error to the error middleware on its own, so the
// controller does nothing: it calls the use case and sends the answer.
// shared/middleware/errorHandler.ts maps `kind` to the status and shows the
// message; `shared/http/refuse.ts` survives for TRANSPORT, where a status IS
// the subject (a malformed uuid, an unparsable body).
//
// FOUR KINDS, AND A FIFTH WOULD NEED A REASON. Anything that is not one of
// these is a fault rather than a refusal, and a fault is a plain `Error`: it
// reaches the caller as 500 with a generic message and the real one in the log.
export type ErrorKind = "not_found" | "forbidden" | "conflict" | "invalid";

// The status each kind answers with, declared once so the middleware and the
// tests read the same table.
export const STATUS_OF_KIND: Record<ErrorKind, number> = {
  not_found: 404,
  forbidden: 403,
  conflict: 409,
  invalid: 422,
};

export class DomainError extends Error {
  readonly kind: ErrorKind;

  constructor(kind: ErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = new.target.name;
  }
}

// The record the caller asked for is not there.
export class NotFound extends DomainError {
  constructor(message: string) {
    super("not_found", message);
  }
}

// The record exists and is not the caller's to act on.
export class Forbidden extends DomainError {
  constructor(message: string) {
    super("forbidden", message);
  }
}

// The record's CURRENT STATE forbids what was asked - a sent order, a settled
// intent, a fulfillment that already belongs to somebody.
export class Conflict extends DomainError {
  constructor(message: string) {
    super("conflict", message);
  }
}

// The request is well formed and asks for something the business does not
// allow: a metal it does not trade, an amount below the processor's floor, an
// operation the order's direction does not have.
export class Invalid extends DomainError {
  constructor(message: string) {
    super("invalid", message);
  }
}

// `unknown` because anything can be thrown. Answers the status a domain error
// earns, or null for everything else - which is what makes the middleware's
// "deliberate or not" question one lookup rather than a chain of instanceofs.
export function statusOfDomainError(err: unknown): number | null {
  return err instanceof DomainError ? STATUS_OF_KIND[err.kind] : null;
}
