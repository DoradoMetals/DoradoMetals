// What an error response tells the caller.
//
// The handler's job is two-sided: print everything to the log, return as little
// as possible to the client. It was only doing the first half. An unexpected
// error's message went straight back - and a Postgres error carries the column,
// the type, the constraint name and, on a unique violation, the conflicting
// value. `where` sat next to it with the absolute path of the source file.
//
// Only `where` was gated on NODE_ENV, so production returned the message.
//
// Pure: no database, no HTTP. The handler is a function of (err, req, res).
import test from "node:test";
import assert from "node:assert/strict";
import errorHandler from "#shared/middleware/errorHandler.js";

// The handler prints a full report to stderr by design. Silence it here so a
// passing run is readable; a test that hides real output is worse than noise,
// so this only swallows what the handler itself writes.
function capture(fn) {
  const real = console.error;
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.error = real;
  }
}

function respond(err, { nodeEnv } = {}) {
  const previous = process.env.NODE_ENV;
  if (nodeEnv !== undefined) process.env.NODE_ENV = nodeEnv;

  let status;
  let body;
  const res = {
    status(code) {
      status = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };

  try {
    capture(() => errorHandler(err, { method: "GET", originalUrl: "/api/x" }, res, () => {}));
  } finally {
    if (nodeEnv !== undefined) process.env.NODE_ENV = previous;
  }
  return { status, body };
}

// The shape of a real one: this is verbatim what
// GET /api/stripe/retrieve_payment_intent produced.
function postgresError() {
  const err = new Error('invalid input syntax for type uuid: "not-a-uuid"');
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
  const err = new Error(
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
// features/carts and features/purchase-orders all do this.
test("a deliberately raised 4xx keeps its message", () => {
  const err = new Error("Address is not valid");
  err.statusCode = 400;

  const { status, body } = respond(err);
  assert.equal(status, 400);
  assert.equal(body.error.message, "Address is not valid");
});

test("a deliberately raised 404 keeps its message", () => {
  const err = new Error("Purchase order not found");
  err.status = 404;

  const { status, body } = respond(err);
  assert.equal(status, 404);
  assert.equal(body.error.message, "Purchase order not found");
});

// A deliberate 5xx is still a 5xx: the caller cannot act on it and the message
// is as likely to be internal as any other.
test("a deliberately raised 5xx is still generic", () => {
  const err = new Error("redis connection pool exhausted at 10.0.0.4:6379");
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
