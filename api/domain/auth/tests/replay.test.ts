import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#pool";
import { outside } from "#shared/testing/pinned-pool.ts";

const { default: app } = await import("#app");

let passwordRowsBefore: number;

beforeAll(async () => {
  passwordRowsBefore = (await outside(`SELECT count(*)::int AS n FROM auth.account`))[0].n;
  assert.equal(typeof passwordRowsBefore, "number", "the baseline count was not taken");
});

afterAll(async () => {
  await pool.end();
});

test("a caller with no session cannot set a password", async () => {
  const res = await request(app)
    .post("/api/account/set_password")
    .send({ newPassword: "this-should-never-be-set" });
  assert.ok([401, 403].includes(res.status), `answered ${res.status} with no session`);
});

test("a missing or malformed password is refused with 400", async () => {
  for (const [name, payload] of [
    ["no body", undefined],
    ["empty object", {}],
    ["null", { newPassword: null }],
    ["empty string", { newPassword: "" }],
    ["a number", { newPassword: 12345678 }],
    ["an object", { newPassword: { toString: "nope" } }],
  ]) {
    const req = request(app).post("/api/account/set_password");
    const res = payload === undefined ? await req : await req.send(payload);

    assert.notEqual(res.status, 200, `"${name}" was accepted as a password`);
    assert.ok(
      [400, 401, 403].includes(res.status),
      `"${name}" answered ${res.status}`
    );
  }
});

test("this suite created no account credential", async () => {
  const rows = await outside(`SELECT count(*)::int AS n FROM auth.account`);
  assert.equal(
    rows[0].n,
    passwordRowsBefore,
    "the auth suite changed auth.account - the pin does not contain better-auth, " +
      "so anything this file writes is COMMITTED to dev"
  );
});
