// Product repo tests against real Postgres.
//
// Products are the table the pricing path depends on: calculateItemPrice reads
// content and bid_premium/ask_premium off these rows, so a column that arrives
// as the wrong type or goes missing misprices an order rather than merely
// rendering oddly. Each test runs inside a transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import pool from "#db";
import * as next from "#features/products/repo.next.js";
import * as exchange from "#features/products/repo.exchange.js";
import * as dual from "#features/products/repo.dual.js";
import { toLegacyShape } from "#features/products/wire.js";

let client;

before(async () => {
  client = await pool.connect();
});

after(async () => {
  client.release();
  await pool.end();
});

async function inRollback(fn) {
  await client.query("BEGIN");
  try {
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

// The three renamed columns are the whole risk of this migration: bullion calls
// them name, description and type where exchange calls them product_name,
// product_description and product_type.
//
// The direction of that rename inverted when the wire adapter went in. The repos
// now return the NEW names - that is the internal truth - and
// features/products/wire.js converts down to the old ones on the way out, behind
// PRODUCTS_WIRE. Both halves are asserted here, because getting either backwards
// is how the frontend breaks.
test("the repo returns the new names, not the exchange ones", async () => {
  await inRollback(async (c) => {
    const [row] = await next.getAllProducts(c);
    for (const k of ["name", "description", "type"]) {
      assert.ok(k in row, `${k} missing`);
      assert.notEqual(row[k], null);
    }
    for (const k of ["product_name", "product_description", "product_type"]) {
      assert.equal(k in row, false, `${k} is the legacy name and should not be here`);
    }
  });
});

test("the adapter converts them back to the names the frontend reads", async () => {
  await inRollback(async (c) => {
    const [row] = await next.getAllProducts(c);
    const legacy = toLegacyShape(row);
    for (const k of ["product_name", "product_description", "product_type"]) {
      assert.ok(k in legacy, `${k} missing from the legacy shape`);
      assert.notEqual(legacy[k], null);
    }
    for (const k of ["name", "description", "type"]) {
      assert.equal(k in legacy, false, `${k} survived the conversion`);
    }
    // A rename and nothing else: every other field is untouched.
    const others = Object.keys(row).filter((k) => !["name", "description", "type"].includes(k));
    for (const k of others) assert.deepEqual(legacy[k], row[k], `${k} changed`);
  });
});

// Both implementations now take the new shape on the way in, so a write made
// through either lands the same value.
test("a write takes the new names on the way in", async () => {
  await inRollback(async (c) => {
    const [p] = await exchange.getAllAdminProducts(c);
    await dual.updateProduct({ ...p, name: "Input Shape Probe" }, "test", c);
    const { rows: [e] } = await c.query(
      "SELECT product_name FROM exchange.products WHERE id = $1", [p.id]);
    assert.equal(e.product_name, "Input Shape Probe");
  });
});

test("every read returns the same keys as exchange", async () => {
  await inRollback(async (c) => {
    const reads = [
      ["getAllProducts", (m) => m.getAllProducts(c)],
      ["getSellProducts", (m) => m.getSellProducts(c)],
      ["getHomepageProducts", (m) => m.getHomepageProducts(c)],
      ["getAllAdminProducts", (m) => m.getAllAdminProducts(c)],
      ["getAllTypes", (m) => m.getAllTypes(c)],
    ];
    for (const [name, run] of reads) {
      const [a] = await run(exchange);
      const [b] = await run(next);
      assert.deepEqual(Object.keys(b).sort(), Object.keys(a).sort(), name);
    }
  });
});

// mint.name and metals' label column are both called `name` in the new schema,
// so an unqualified projection silently returns the wrong one. This asserts the
// values, not just the keys.
test("mint and metal resolve to their own names, not each other's", async () => {
  await inRollback(async (c) => {
    const ex = await exchange.getAllAdminProducts(c);
    const nx = await next.getAllAdminProducts(c);
    const byId = new Map(ex.map((r) => [r.id, r]));
    for (const r of nx) {
      const e = byId.get(r.id);
      assert.equal(r.mint_name, e.mint_name, `mint_name for ${r.id}`);
      assert.equal(r.metal_type, e.metal_type, `metal_type for ${r.id}`);
    }
  });
});

// Money arrives as a JS number only if a type parser is registered for NUMERIC.
// Without one node-postgres hands back a string and every premium multiplication
// becomes concatenation.
test("premiums and content are numbers, not strings", async () => {
  await inRollback(async (c) => {
    for (const r of await next.getAllProducts(c)) {
      for (const k of ["bid_premium", "ask_premium", "content", "gross", "purity"]) {
        assert.equal(typeof r[k], "number", `${k} on ${r.id} was ${typeof r[k]}`);
      }
    }
  });
});

test("storefront reads are ordered deterministically", async () => {
  await inRollback(async (c) => {
    for (const read of ["getAllProducts", "getSellProducts", "getHomepageProducts"]) {
      const ids = (await next[read](c)).map((r) => r.id);
      assert.deepEqual(ids, [...ids].sort(), `${read} not ordered by id`);
    }
  });
});

test("display flags actually filter", async () => {
  await inRollback(async (c) => {
    const all = await next.getAllAdminProducts(c);
    const shown = await next.getAllProducts(c);
    assert.equal(shown.length, all.filter((r) => r.display).length);
    assert.ok(shown.length < all.length, "nothing is hidden, so the filter is untested");
  });
});

// The mirror is the dual-write phase's only guarantee. It copies server-side, so
// this also pins that microseconds survive - a JS round trip truncates them to
// milliseconds, which is the bug migration 015 had to undo.
test("mirrorProduct copies a row byte for byte, microseconds included", async () => {
  await inRollback(async (c) => {
    const { rows: [e] } = await c.query(
      "SELECT * FROM exchange.products ORDER BY id LIMIT 1"
    );
    await c.query("UPDATE exchange.products SET product_name = $1, updated_at = $2 WHERE id = $3",
      [e.product_name + " (edited)", "2026-03-04 05:06:07.123456", e.id]);
    await next.mirrorProduct(e.id, c);
    const { rows: [b] } = await c.query(
      "SELECT * FROM products.bullion WHERE id = $1", [e.id]
    );
    assert.equal(b.name, e.product_name + " (edited)");
    const { rows: [{ micros }] } = await c.query(
      "SELECT to_char(updated_at, 'US') micros FROM products.bullion WHERE id = $1", [e.id]
    );
    assert.equal(micros, "123456");
  });
});

test("mirrorProduct is an upsert, not an insert", async () => {
  await inRollback(async (c) => {
    const { rows: [e] } = await c.query("SELECT id FROM exchange.products ORDER BY id LIMIT 1");
    const before = (await c.query("SELECT count(*)::int n FROM products.bullion")).rows[0].n;
    await next.mirrorProduct(e.id, c);
    await next.mirrorProduct(e.id, c);
    const after = (await c.query("SELECT count(*)::int n FROM products.bullion")).rows[0].n;
    assert.equal(after, before, "mirroring twice changed the row count");
  });
});

// Dual-write is only reversible if both tables end up with the row. If the
// mirror silently no-opped, exchange would be complete and bullion would not,
// and the divergence would only surface after the switch was flipped.
test("dual-write leaves both tables holding the same product", async () => {
  await inRollback(async (c) => {
    const [p] = await exchange.getAllAdminProducts(c);
    await dual.updateProduct({ ...p, name: "Parity Probe" }, "test", c);
    const { rows: [e] } = await c.query(
      "SELECT product_name FROM exchange.products WHERE id = $1", [p.id]);
    const { rows: [b] } = await c.query(
      "SELECT name FROM products.bullion WHERE id = $1", [p.id]);
    assert.equal(e.product_name, "Parity Probe");
    assert.equal(b.name, "Parity Probe");
  });
});

// Everything above runs on a client inside a transaction. If any of it were
// leaking out, the rollback would not undo it and the tests would be quietly
// mutating the dev database. Checked from a second connection, which is what a
// concurrent request would be.
test("a write made on the client is invisible on another connection", async () => {
  const other = await pool.connect();
  await client.query("BEGIN");
  try {
    const { rows: [p] } = await client.query(
      "SELECT id FROM exchange.products ORDER BY id LIMIT 1"
    );
    await client.query(
      "UPDATE products.bullion SET name = 'Uncommitted' WHERE id = $1", [p.id]
    );
    const { rows: [seen] } = await other.query(
      "SELECT name FROM products.bullion WHERE id = $1", [p.id]
    );
    assert.notEqual(seen.name, "Uncommitted");
  } finally {
    await client.query("ROLLBACK");
    other.release();
  }
});
