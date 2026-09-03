// What an error response tells the caller — the handler's job is print-everything-to-log, return-as-little-as-possible-to-client; it was only doing the first half (an unexpected error's message, including a Postgres error's column/type/constraint/value, went straight back, and `where` — the absolute source path — was gated on NODE_ENV but the message wasn't).
// Pure: no database, no HTTP. The handler is a function of (err, req, res).
import test from "node:test";
import assert from "node:assert/strict";
import errorHandler from "#shared/middleware/errorHandler.ts";
import type { NextFunction, Request, Response } from "express";

// The body every response in this file carries. Declared as the subset the
// assertions read - `success` and an `error` envelope - rather than inferred
// from whatever the first assignment happened to be.
type ErrorBody = {
  success: boolean;
  error: {
    message: string;
    code?: unknown;
    details?: unknown;
    stack?: unknown;
    /** The absolute source path. Present in development, absent in production. */
    where?: unknown;
  };
};

// The handler prints a full report to stderr by design. Silence it here so a
// passing run is readable; a test that hides real output is worse than noise,
// so this only swallows what the handler itself writes.
function capture<T>(fn: () => T): T {
  const real = console.error;
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.error = real;
  }
}

function respond(
  err: unknown,
  { nodeEnv }: { nodeEnv?: string } = {}
): { status: number; body: ErrorBody } {
  const previous = process.env.NODE_ENV;
  if (nodeEnv !== undefined) process.env.NODE_ENV = nodeEnv;

  let status: number | undefined;
  let body: ErrorBody | undefined;
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json(payload: ErrorBody) {
      body = payload;
      return this;
    },
  };

  try {
    // The only casts in this file, at the fake-object boundary — Express's Request/Response have hundreds of members, and errorHandler reads only a few; narrowed once here rather than typed `any`, which would also erase the checks on status/json below.
    capture(() =>
      errorHandler(
        err,
        { method: "GET", originalUrl: "/api/x" } as unknown as Request,
        res as unknown as Response,
        (() => {}) as NextFunction
      )
    );
  } finally {
    if (nodeEnv !== undefined) process.env.NODE_ENV = previous;
  }
  // Asserted, not assumed — a handler that returned without calling res.json would otherwise fail every test below with an unhelpful 'cannot read properties of undefined'.
  assert.ok(status !== undefined, "errorHandler did not set a status");
  assert.ok(body, "errorHandler did not send a body");
  return { status, body };
}

// The shape of a real one: this is verbatim what
// GET /api/stripe/retrieve_payment_intent produced.
// A driver error is an Error with extra fields, which is what `pg` and axios
// both raise and what the handler branches on. Declared, because `Error` has no
// `code` and the assignments below were silently widening it.
type CodedError = Error & { code?: string; statusCode?: number; status?: number };

function postgresError(): CodedError {
  const err: CodedError = new Error('invalid input syntax for type uuid: "not-a-uuid"');
  err.code = "22P02";
  err.name = "error";
  return err;
}

test("an unexpected error does not return its own message", () => {
  const { status, body } = respond(postgresError());

  assert.equal(status, 500);
  assert.equal(body.success, false);
  assert.equal(body.error.message, "Server error");
  assert.ok(
    !JSON.stringify(body).includes("invalid input syntax"),
    "the underlying error text reached the client"
  );
  assert.ok(
    !JSON.stringify(body).includes("uuid"),
    "the column type reached the client"
  );
});

// A unique violation is the worst case, because its message quotes the value
// that collided - which is user data.
test("a constraint violation does not return the value that collided", () => {
  const err: CodedError = new Error(
    'duplicate key value violates unique constraint "users_email_key"\n' +
      "DETAIL:  Key (email)=(someone@example.com) already exists."
  );
  err.code = "23505";

  const { body } = respond(err);
  const json = JSON.stringify(body);
  assert.ok(!json.includes("someone@example.com"), "a customer's email reached the client");
  assert.ok(!json.includes("users_email_key"), "the constraint name reached the client");
});

// An error raised on purpose was written to be read. features/addresses,
// features/checkout and features/purchase-orders all do this.
test("a deliberately raised 4xx keeps its message", () => {
  const err: CodedError = new Error("Address is not valid");
  err.statusCode = 400;

  const { status, body } = respond(err);
  assert.equal(status, 400);
  assert.equal(body.error.message, "Address is not valid");
});

test("a deliberately raised 404 keeps its message", () => {
  const err: CodedError = new Error("Purchase order not found");
  err.status = 404;

  const { status, body } = respond(err);
  assert.equal(status, 404);
  assert.equal(body.error.message, "Purchase order not found");
});

// A deliberate 5xx is still a 5xx: the caller cannot act on it and the message
// is as likely to be internal as any other.
test("a deliberately raised 5xx is still generic", () => {
  const err: CodedError = new Error("redis connection pool exhausted at 10.0.0.4:6379");
  err.statusCode = 503;

  const { status, body } = respond(err);
  assert.equal(status, 503);
  assert.equal(body.error.message, "Server error");
});

// `where` is the absolute path of the source file. It is useful in dev and is
// nobody's business in production.
test("the source path is returned in development and never in production", () => {
  const withStack = postgresError();
  withStack.stack =
    "Error: x\n    at Module.retrievePaymentIntent (/home/jtj60/dorado-exchange/api/features/stripe/repo.js:23:5)";

  const dev = respond(withStack, { nodeEnv: "development" });
  assert.ok(dev.body.error.where, "dev lost the source path, which is the point of it");

  const prod = respond(withStack, { nodeEnv: "production" });
  assert.equal(prod.body.error.where, undefined);
  assert.ok(
    !JSON.stringify(prod.body).includes("/home/"),
    "an absolute server path reached the client"
  );
});
