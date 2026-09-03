// media.emails, append-only, against real Postgres - proves create() writes the row given and reads back what it wrote (no update()/remove() to pin).
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#db";
import * as repo from "#db/media/emails/repo.ts";

let client: PoolClient;

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  client = await pool.connect();
});

afterAll(async () => {
  client.release();
  await pool.end();
});

async function inRollback(fn: (c: PoolClient) => Promise<void>) {
  await client.query("BEGIN");
  try {
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

test("create writes a row and returns its id", async () => {
  await inRollback(async (c) => {
    const written = await repo.create({
      kind: "auth_verification",
      status: "sent",
      to_address: "nobody@example.com",
      subject: "Verify Your Email Address",
      order_id: null,
      user_id: null,
      pdf_id: null,
      provider_message_id: "test-message-id",
      error: null,
    }, c);
    assert.ok(written.id);

    const { rows } = await c.query(
      "SELECT status, to_address, provider_message_id FROM media.emails WHERE id = $1", [written.id]
    );
    assert.equal(rows[0].status, "sent");
    assert.equal(rows[0].to_address, "nobody@example.com");
    assert.equal(rows[0].provider_message_id, "test-message-id");
  });
});

test("a failed send is a row too, carrying its error text", async () => {
  await inRollback(async (c) => {
    const written = await repo.create({
      kind: "auth_verification",
      status: "failed",
      to_address: "nobody@example.com",
      subject: "Verify Your Email Address",
      order_id: null,
      error: "SMTP refused",
    }, c);

    const { rows } = await c.query(
      "SELECT status, error FROM media.emails WHERE id = $1", [written.id]
    );
    assert.equal(rows[0].status, "failed");
    assert.equal(rows[0].error, "SMTP refused");
  });
});
