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

test("every shipping tier prices exactly what getShippingCharge charges", async () => {
  const { rows: tiers } = await query(
    `SELECT code, price, free_over FROM shipping.tiers WHERE enabled`
  );
  assert.ok(tiers.length >= 3, "shipping.tiers is missing rows - did 109 run?");

  for (const tier of tiers) {
    assert.equal(
      getShippingCharge(500, tier.code),
      Number(tier.price),
      `tier ${tier.code}: the row says ${tier.price}, getShippingCharge says ` +
        `${getShippingCharge(500, tier.code)}`
    );
    if (tier.free_over != null) {
      assert.equal(
        getShippingCharge(Number(tier.free_over) + 1, tier.code),
        0,
        `tier ${tier.code}: free_over ${tier.free_over} is not honoured by getShippingCharge`
      );
    }
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
