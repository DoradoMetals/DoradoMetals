// Every purchase order has a full set of spots, or none at all.
//
// exchange.order_metals is one row per metal per order - the spot prices the
// order was priced against, frozen at the moment they were locked. An order
// holding Gold and Silver but not Platinum and Palladium is missing a row, and
// every figure derived from the missing metal silently becomes zero.
//
// THIS LIVES HERE RATHER THAN IN AN END-TO-END TEST, and the reason is a
// mistake worth recording. It was first written as a Playwright assertion that
// searched the rendered drawer for the four metal names. It reported "lists
// Silver but not Gold" and looked like a real find - it was matching the ITEM
// name "Silver Coin (2 oz)". A regex over rendered text cannot tell a metal in
// a price table from a metal in a product name.
//
// In SQL the question is exact, and it covers every order rather than whichever
// one sorts first.
import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import pool from "#db";
import query from "#shared/db/query.ts";

// The two projections, spelled out: `query` is generic and a bare call gives
// back `unknown` rows, which is the point of converting these files.
type PartialSet = { order_number: number; metals: number; listed: string | null };

afterAll(async () => {
  await pool.end();
});

test("no purchase order has a partial set of order metals", async () => {
  const { rows } = await query<PartialSet>(`
    SELECT po.order_number, count(om.*)::int AS metals,
           string_agg(om.type, ', ' ORDER BY om.type) AS listed
    FROM exchange.purchase_orders po
    LEFT JOIN exchange.order_metals om ON om.purchase_order_id = po.id
    GROUP BY po.id, po.order_number
    HAVING count(om.*) NOT IN (0, 4)
    ORDER BY po.order_number
  `);

  assert.deepEqual(
    rows,
    [],
    "orders with an incomplete spot set:\n" +
      rows.map((r) => `  PO ${r.order_number}: ${r.metals} of 4 (${r.listed})`).join("\n")
  );
});

// The counterpart, so the assertion above is not vacuous: orders WITH spots
// must exist. If every order had zero metals the check above would pass while
// telling us nothing.
test("orders with a full spot set exist, so the check above means something", async () => {
  const { rows } = await query<{ n: number }>(`
    SELECT count(*)::int AS n FROM (
      SELECT po.id FROM exchange.purchase_orders po
      JOIN exchange.order_metals om ON om.purchase_order_id = po.id
      GROUP BY po.id HAVING count(om.*) = 4
    ) full_sets
  `);
  assert.ok(
    rows[0].n > 0,
    "no order has a complete spot set - the partial-set check is proving nothing"
  );
});
