// Proves shared/testing/no-network.ts, preloaded via `node --import` for
// every lane but `test:external` (see package.json's `test` script and
// `test:external`'s own header). Two directions, same as every guard in this
// codebase: the block must actually block, and it must not take Postgres
// with it.
import test from "node:test";
import assert from "node:assert/strict";
import https from "node:https";
import { outside } from "#shared/testing/pinned-pool.ts";

test("an outbound HTTPS request to a real host is refused by nock, not attempted", async () => {
  const err = await new Promise<Error>((resolve, reject) => {
    const req = https.request("https://api.stripe.com/v1/charges", () => {
      reject(new Error("the request reached a response handler - it left the process"));
    });
    req.on("error", resolve);
    req.end();
  });

  assert.equal(
    err.name, "NetConnectNotAllowedError",
    `expected nock's refusal, got ${err.name}: ${err.message}`
  );
  assert.match(err.message, /api\.stripe\.com/, "the refusal did not name the blocked host");
});

test("Postgres on the local cluster still connects", async () => {
  const rows = await outside<{ one: number }>("SELECT 1 AS one");
  assert.equal(rows[0]?.one, 1, "the allow-listed host did not answer");
});
