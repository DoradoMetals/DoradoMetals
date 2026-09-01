// THE PIN BETWEEN PURE PRICING AND THE REFERENCE ROWS (D207).
//
// Pricing is pure - getShippingCharge and calculateCardCharge are constants in
// code, deliberately, because they run inside pure functions that everything
// prices through. 109 gave the same numbers a second home (shipping.tiers,
// payments.methods) so the frontend reads rows instead of hardcoding them.
// Two homes for one number is exactly the drift bug this project keeps
// finding in itself, so this test holds them together: change either side and
// it fails until the other moves too. The day pricing reads the tables, this
// pin comes out with the constants.
import { test } from "node:test";
import assert from "node:assert/strict";
import "#env";
import query from "#shared/db/query.ts";
import pool from "#db";
import {
  calculateCardCharge,
  getShippingCharge,
} from "#features/pricing/ask.ts";

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
    // The free-over-$1000 rule is order-level in getShippingCharge; every
    // priced service ships free above it.
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
  // CREDIT and WIRE are deliberately NOT pinned: their rows say "No Fee" and
  // calculateCardCharge surcharges them at 2.9% - the open money question
  // FOLLOWUPS item 1 records. Pinning would bless one side of a question
  // Jacob has not answered.
});

test.after(async () => {
  await pool.end();
});
