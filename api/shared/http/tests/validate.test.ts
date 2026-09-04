// The transport boundary's strict-parse-and-refuse core, and the uuid-shaped
// checks that share it — pure, no database, no HTTP server.
import { test } from "vitest";
import assert from "node:assert/strict";
import { z } from "zod/v4";
import {
  uuidLike,
  parseStrict,
  strictBody,
  uuidParam,
  uuidField,
} from "#shared/http/validate.ts";

const ALL_ONES = "11111111-1111-1111-1111-111111111111";

test("uuidLike accepts a well-formed-but-fake id", () => {
  assert.equal(uuidLike.safeParse(ALL_ONES).success, true);
});

test("uuidLike rejects a value with the wrong shape", () => {
  assert.equal(uuidLike.safeParse("not-a-uuid").success, false);
});

const person = z.object({ name: z.string(), age: z.number() });

test("parseStrict returns the parsed value on success", () => {
  const value = parseStrict(person, { name: "Alice", age: 5 }, "person");
  assert.deepEqual(value, { name: "Alice", age: 5 });
});

test("parseStrict names the subject and the failing path in a 400", () => {
  assert.throws(
    () => parseStrict(person, { name: "Alice", age: "five" }, "leads/create body"),
    (err: any) => {
      assert.equal(err.statusCode, 400);
      assert.match(err.message, /^leads\/create body: "age"/);
      return true;
    }
  );
});

test("parseStrict falls back to the bare issue message when the issue has no path", () => {
  // A top-level type mismatch (schema expects an object, gets a string) has no
  // field path — the message must not read '"" is invalid' or similar.
  assert.throws(
    () => parseStrict(person, "not an object", "subject"),
    (err: any) => {
      assert.equal(err.statusCode, 400);
      assert.ok(!err.message.includes('""'), `unexpected empty path in: ${err.message}`);
      return true;
    }
  );
});

test("strictBody defaults a missing body to {} rather than throwing on undefined", () => {
  const optional = z.object({ note: z.string().optional() });
  assert.deepEqual(strictBody(optional, undefined), {});
});

test("strictBody refuses a malformed body with no subject prefix", () => {
  assert.throws(
    () => strictBody(person, { name: "Alice" }),
    (err: any) => {
      assert.equal(err.statusCode, 400);
      // No subject means the message starts with the quoted field path itself,
      // not a "subject: " prefix in front of it.
      assert.match(
        err.message,
        /^"age"/,
        `expected the message to start with the field path, got: ${err.message}`
      );
      return true;
    }
  );
});

test("uuidParam returns a well-formed id", () => {
  const req = { params: { id: ALL_ONES } };
  assert.equal(uuidParam(req, "id"), ALL_ONES);
});

test("uuidParam refuses a malformed id naming the param", () => {
  const req = { params: { id: "not-a-uuid" } };
  assert.throws(
    () => uuidParam(req, "id"),
    (err: any) => {
      assert.equal(err.statusCode, 400);
      assert.equal(err.message, '"id" must be a uuid');
      return true;
    }
  );
});

test("uuidField returns a well-formed id from the body", () => {
  assert.equal(uuidField({ addressId: ALL_ONES }, "addressId"), ALL_ONES);
});

test("uuidField refuses a missing body entirely", () => {
  assert.throws(
    () => uuidField(undefined, "addressId"),
    (err: any) => {
      assert.equal(err.statusCode, 400);
      assert.equal(err.message, '"addressId" must be a uuid');
      return true;
    }
  );
});

test("uuidField refuses a non-string value rather than coercing it", () => {
  assert.throws(
    () => uuidField({ addressId: 12345 }, "addressId"),
    (err: any) => err.statusCode === 400
  );
});
