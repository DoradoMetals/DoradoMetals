// The download service: which truth answers (stored file vs live render) and for whom. No Chromium here - the render is a stub; these tests are about SELECTION (which row, when the fallback fires, that a broken store never breaks the download).
// The storage read is the StoredReader parameter - putObject is skipped under isTestRun, so the stub is what lets the stored path be exercised at all. Rows are written inside this file's transaction and rolled back, like paper-trail.test.ts.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { createHash, randomUUID } from "node:crypto";
import pool from "#db";
import { serveOrderDocument } from "#domain/media/pdfs/serve.ts";
import * as orderRead from "#domain/orders/read.ts";
import { LOCKS } from "#shared/testing/locks.ts";

let client: PoolClient;
// getAllPurchases declares Record<string, unknown>[], so the subset this file reads is named here.
type OrderFixture = { id: string };

let order: OrderFixture; // a real dev purchase order that orders.orders knows
let owner: { id: string; role: string }; // the order's real owner

// SESSION-scoped LOCKS.ORDERS, held for the whole file (lane 3, the runner
// conversion): `order` is picked once here and referenced by every test's
// own INSERTs after, and domain/orders/tests/edit-line.test.ts writes real,
// autocommitting rows to orders.orders under the SAME lock - see
// domain/media/pdfs/tests/documents-agree.test.ts's own comment for the full
// mechanism.
beforeAll(async () => {
  client = await pool.connect();
  await client.query("SELECT pg_advisory_lock($1)", [LOCKS.ORDERS]);
  const orders = (await orderRead.list({ direction: "purchase" })) as unknown as OrderFixture[];
  assert.ok(orders.length > 0, "dev has no purchase orders");

  // media.pdfs.order_id references orders.orders, so the fixtures need an order the schema knows - asserted rather than assumed, so a dev database whose orders were never backfilled fails here, loudly, not in an INSERT three tests down.
  // Needs an OWNER too, not merely a row: a guest/anonymous purchase order is
  // a valid `orders.orders` state (user_id IS NULL) and a `LIMIT`-less first
  // match can land on one when other files run concurrently, so this keeps
  // searching rather than taking the first row that merely exists.
  for (const o of orders) {
    const { rows } = await client.query(
      "SELECT user_id FROM orders.orders WHERE id = $1",
      [o.id]
    );
    if (rows.length && rows[0].user_id) {
      order = o;
      owner = { id: rows[0].user_id, role: "user" };
      break;
    }
  }
  assert.ok(order, "no dev purchase order exists in orders.orders");
  assert.ok(owner.id, "the linkable order has no user_id to own it");
});

afterAll(async () => {
  await client.query("SELECT pg_advisory_unlock($1)", [LOCKS.ORDERS]);
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

const sha256 = (bytes: Buffer | Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

const STORED = Buffer.from("%PDF-1.4 the bytes the customer was actually sent");
const RENDERED = Buffer.from("%PDF-1.4 a fresh render of the request body");

// A render stub that counts, so a test can assert the renderer was - or was not - consulted.
const renderer = () => {
  const calls: number[] = [];
  return {
    calls,
    render: async () => {
      calls.push(1);
      return RENDERED;
    },
  };
};

// A reader stub that records which path was asked for.
const reader = (bytes: Buffer | null) => {
  const paths: string[] = [];
  return {
    paths,
    read: async (path: string) => {
      paths.push(path);
      if (bytes === null) throw new Error("NoSuchKey: object deleted out-of-band");
      return bytes;
    },
  };
};

async function insertRow(
  c: PoolClient,
  { path, checksum, hoursAgo }: { path: string; checksum: string; hoursAgo: number }
) {
  await c.query(
    `INSERT INTO media.pdfs (kind, order_id, path, size_bytes, checksum, created_at)
     VALUES ('invoice', $1, $2, $3, $4, now() - make_interval(hours => $5))`,
    [order.id, path, STORED.length, checksum, hoursAgo]
  );
}

const pdfRowCount = async (c: PoolClient) => {
  const { rows } = await c.query(
    "SELECT count(*)::int AS n FROM media.pdfs WHERE order_id = $1",
    [order.id]
  );
  return rows[0].n;
};

test("the LATEST stored row of the kind is the one served", async () => {
  await inRollback(async (c: PoolClient) => {
    // Regeneration inserts, never updates, so two rows of one kind is the normal shape of a re-sent document - created_at decides.
    await insertRow(c, { path: "pdfs/x/old.pdf", checksum: sha256("stale"), hoursAgo: 2 });
    await insertRow(c, { path: "pdfs/x/new.pdf", checksum: sha256(STORED), hoursAgo: 1 });

    const r = renderer();
    const storage = reader(STORED);
    const served = await serveOrderDocument(
      { kind: "invoice", order_id: order.id, caller: owner, render: r.render },
      storage.read,
      c
    );

    assert.equal(served.source, "stored");
    assert.deepEqual(Buffer.from(served.bytes), STORED);
    assert.deepEqual(storage.paths, ["pdfs/x/new.pdf"], "the newest row's object, nothing else");
    assert.equal(r.calls.length, 0, "a stored document must not be re-rendered");
  });
});

test("an admin who does not own the order still gets the stored document", async () => {
  await inRollback(async (c: PoolClient) => {
    await insertRow(c, { path: "pdfs/x/new.pdf", checksum: sha256(STORED), hoursAgo: 1 });

    const r = renderer();
    const served = await serveOrderDocument(
      { kind: "invoice", order_id: order.id, caller: { id: randomUUID(), role: "admin" }, render: r.render },
      reader(STORED).read,
      c
    );
    assert.equal(served.source, "stored");
    assert.equal(r.calls.length, 0);
  });
});

test("no stored row: the fallback renders live AND persists, so the second download reads the store", async () => {
  await inRollback(async (c: PoolClient) => {
    assert.equal(await pdfRowCount(c), 0, "the fixture order already has rows");

    const r = renderer();
    const storage = reader(STORED);
    const served = await serveOrderDocument(
      { kind: "invoice", order_id: order.id, caller: owner, render: r.render },
      storage.read,
      c
    );

    assert.equal(served.source, "rendered");
    assert.deepEqual(Buffer.from(served.bytes), RENDERED);
    assert.equal(r.calls.length, 1);
    assert.deepEqual(storage.paths, [], "there was nothing stored to read");

    // The migration path for pre-trail orders: the render just served is now the stored truth.
    const { rows } = await c.query(
      "SELECT kind, checksum, size_bytes FROM media.pdfs WHERE order_id = $1",
      [order.id]
    );
    assert.equal(rows.length, 1, "the fallback did not persist its render");
    assert.equal(rows[0].kind, "invoice");
    assert.equal(rows[0].checksum, sha256(RENDERED));
    assert.equal(Number(rows[0].size_bytes), RENDERED.length);

    // And the second download is a stored read, no render.
    const second = renderer();
    const secondStorage = reader(RENDERED);
    const again = await serveOrderDocument(
      { kind: "invoice", order_id: order.id, caller: owner, render: second.render },
      secondStorage.read,
      c
    );
    assert.equal(again.source, "stored");
    assert.equal(second.calls.length, 0);
  });
});

test("a storage miss falls back to a live render with a stderr note, never a 500", async () => {
  await inRollback(async (c: PoolClient) => {
    await insertRow(c, { path: "pdfs/x/gone.pdf", checksum: sha256(STORED), hoursAgo: 1 });

    const notes: string[] = [];
    const realError = console.error;
    console.error = (...args: unknown[]) => notes.push(args.map(String).join(" "));
    let served;
    const r = renderer();
    try {
      served = await serveOrderDocument(
        { kind: "invoice", order_id: order.id, caller: owner, render: r.render },
        reader(null).read, // the object was deleted out-of-band
        c
      );
    } finally {
      console.error = realError;
    }

    assert.equal(served.source, "rendered", "the download must not break over bookkeeping");
    assert.deepEqual(Buffer.from(served.bytes), RENDERED);
    assert.equal(r.calls.length, 1);
    assert.ok(
      notes.some((n) => n.includes("could not be read")),
      "the miss left no note on stderr"
    );
    // The trail records what was SENT; a fresh render is not that, so the miss must not insert a row claiming it is.
    assert.equal(await pdfRowCount(c), 1);
  });
});

test("stored bytes that no longer match their checksum are a miss, not a serve", async () => {
  await inRollback(async (c: PoolClient) => {
    await insertRow(c, { path: "pdfs/x/new.pdf", checksum: sha256("what was really sent"), hoursAgo: 1 });

    const realError = console.error;
    console.error = () => {};
    let served;
    try {
      served = await serveOrderDocument(
        { kind: "invoice", order_id: order.id, caller: owner, render: renderer().render },
        reader(STORED).read, // returns bytes, but not the recorded ones
        c
      );
    } finally {
      console.error = realError;
    }
    assert.equal(served.source, "rendered", "corrupt bytes must not be served as the stored truth");
  });
});

// The non-widening pin: these routes are requireUser only (never requireOwnOrder) - survivable before the store existed because a caller only got a render of data they already possessed.
// The stored path must keep that survivable: a signed-in stranger naming somebody else's order id gets exactly yesterday's behavior (a render of their own body), and the store is never consulted for them.
test("a caller who does not own the order never touches the store and persists nothing", async () => {
  await inRollback(async (c: PoolClient) => {
    await insertRow(c, { path: "pdfs/x/new.pdf", checksum: sha256(STORED), hoursAgo: 1 });

    const r = renderer();
    const storage = reader(STORED);
    const served = await serveOrderDocument(
      { kind: "invoice", order_id: order.id, caller: { id: randomUUID(), role: "user" }, render: r.render },
      storage.read,
      c
    );

    assert.equal(served.source, "rendered");
    assert.deepEqual(storage.paths, [], "the store answered a caller the order does not belong to");
    assert.equal(r.calls.length, 1);
    assert.equal(await pdfRowCount(c), 1, "a stranger's render must not enter the paper trail");
  });
});

// The seam's own guard, pinned like the transport's: a test that forgets to pass a reader must not reach live MinIO - the default reader refuses under isTestRun, and the refusal is swallowed into a live render, so even then the download answers.
test("the default reader refuses in a test run, and the download still answers", async () => {
  await inRollback(async (c: PoolClient) => {
    await insertRow(c, { path: "pdfs/x/new.pdf", checksum: sha256(STORED), hoursAgo: 1 });

    const notes: string[] = [];
    const realError = console.error;
    console.error = (...args: unknown[]) => notes.push(args.map(String).join(" "));
    let served;
    try {
      served = await serveOrderDocument(
        { kind: "invoice", order_id: order.id, caller: owner, render: renderer().render },
        undefined, // no reader passed - the default must refuse, not read
        c
      );
    } finally {
      console.error = realError;
    }
    assert.equal(served.source, "rendered");
    assert.ok(
      notes.some((n) => n.includes("refusing to read real object storage")),
      "the default reader did not refuse"
    );
  });
});
