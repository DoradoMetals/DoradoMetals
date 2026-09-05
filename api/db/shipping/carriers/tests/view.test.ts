import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#pool";
import { inRollback } from "#shared/testing/rollback.ts";
import * as carriers from "#db/shipping/carriers/repo.ts";
import { ComposedCarrier } from "@dorado/contracts";

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
});
afterAll(async () => { await pool.end(); });

const aCarrier = async (c: PoolClient, name: string) => {
  const organization_id = randomUUID();
  await c.query(
    `INSERT INTO organizations.organizations (id, type, name, email, phone, enabled)
     VALUES ($1, 'CARRIER', $2, 'ops@example.test', '2145550100', true)`,
    [organization_id, name]
  );
  return await carriers.create(
    { id: randomUUID(), organization_id, logo: "logo.svg" }, c
  );
};

test("the carrier view parses through ComposedCarrier with its owner nested", async () => {
  await inRollback(async (c: PoolClient) => {
    const built = await aCarrier(c, `Test Carrier ${randomUUID().slice(0, 8)}`);

    const [view] = await carriers.view(built.id, c);
    assert.ok(view, "the view read nothing back");
    ComposedCarrier.parse(view);

    assert.equal(view.id, built.id);
    assert.equal(view.logo, "logo.svg");
    assert.equal(view.organization.id, built.organization_id);
    assert.equal(view.organization.email, "ops@example.test");
    assert.ok(view.created_at.endsWith("Z"), "the organization's stamp is not UTC");
  });
});

test("a carrier with no organization is not a carrier the view answers", async () => {
  await inRollback(async (c: PoolClient) => {
    const orphan = await carriers.create(
      { id: randomUUID(), organization_id: null, logo: null }, c
    );
    assert.deepEqual(await carriers.view(orphan.id, c), []);
  });
});
