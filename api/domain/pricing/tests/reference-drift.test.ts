import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import "#env";
import query from "#shared/db/query.ts";
import pool from "#pool";
import {
  calculateCardCharge,
  getShippingCharge,
} from "#domain/pricing/ask.ts";

test("every sale service prices exactly what getShippingCharge charges", async () => {
  const { rows: options } = await query(
    `SELECT code, price FROM shipping.services
      WHERE carrier_id IS NULL AND price IS NOT NULL AND is_active`
  );
  assert.ok(options.length >= 3, "the sale service rows are missing - did 110 run?");

  for (const option of options) {
    assert.equal(
      getShippingCharge(500, option.code),
      Number(option.price),
      `service ${option.code}: the row says ${option.price}, getShippingCharge says ` +
        `${getShippingCharge(500, option.code)}`
    );
    assert.equal(
      getShippingCharge(1001, option.code),
      0,
      `service ${option.code}: the over-$1000 order did not ship free`
    );
  }
});

test("the sale surcharges the rows advertise are the ones calculateCardCharge takes", async () => {
  const { rows } = await query(
    `SELECT type, surcharge_percent FROM payments.methods
      WHERE direction = 'sale' AND type IN ('CARD', 'ACH')`
  );
  assert.equal(rows.length, 2, "the sale CARD and ACH rows are missing - did 109 run?");

  for (const row of rows) {
    assert.equal(
      calculateCardCharge(100, row.type),
      100 * Number(row.surcharge_percent),
      `${row.type}: the row advertises ${row.surcharge_percent}, ` +
        `calculateCardCharge takes ${calculateCardCharge(100, row.type) / 100}`
    );
  }
});

afterAll(async () => {
  await pool.end();
});
