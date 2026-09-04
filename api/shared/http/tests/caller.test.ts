// callerId and requiredParam/param — the two "absent input becomes a named
// status code" helpers transport code leans on instead of a `!` or a
// hand-rolled 400/401 at every call site.
import { test } from "vitest";
import assert from "node:assert/strict";
import type { Request } from "express";
import { callerId, param, requiredParam } from "#shared/http/caller.ts";

type WithUser = { user?: { id?: string } };

test("callerId returns the signed-in user's id", () => {
  const req = { user: { id: "user-1" } } as unknown as Request;
  assert.equal(callerId(req), "user-1");
});

test("callerId answers 401 when there is no session", () => {
  const req = {} as WithUser as Request;
  assert.throws(
    () => callerId(req),
    (err: any) => {
      assert.equal(err.statusCode, 401);
      assert.match(err.message, /no session/);
      return true;
    }
  );
});

test("callerId answers 401 when req.user.id is empty", () => {
  const req = { user: { id: "" } } as WithUser as Request;
  assert.throws(() => callerId(req), (err: any) => err.statusCode === 401);
});

test("param returns the named route param", () => {
  const req = { params: { id: "abc" } };
  assert.equal(param(req, "id"), "abc");
});

test("param answers 400 naming the missing param, not a generic message", () => {
  const req = { params: {} };
  assert.throws(
    () => param(req, "orderId"),
    (err: any) => {
      assert.equal(err.statusCode, 400);
      assert.equal(err.message, "orderId is required");
      return true;
    }
  );
});

test("requiredParam refuses a non-string value rather than coercing it", () => {
  // express 5 types a repeatable param as string | string[] — an array must be
  // refused, not silently joined or truncated into a query that matches
  // something the caller never asked for.
  assert.throws(
    () => requiredParam(["a", "b"], "tag"),
    (err: any) => {
      assert.equal(err.statusCode, 400);
      assert.equal(err.message, "tag is required");
      return true;
    }
  );
});

test("requiredParam refuses an empty string, not just a missing value", () => {
  assert.throws(() => requiredParam("", "id"), (err: any) => err.statusCode === 400);
});

test("requiredParam refuses undefined", () => {
  assert.throws(() => requiredParam(undefined, "id"), (err: any) => err.statusCode === 400);
});
