// The audit stamp, end to end: a request's actor becomes a row's author.
//
// WHAT THIS PROVES, AND WHY IT NEEDS THE WHOLE CHAIN. Migration 116 moved
// created_by / created_by_id / updated_by / updated_by_id / created_at /
// updated_at out of every INSERT and UPDATE and into one trigger. Nothing in
// TypeScript mentions those columns any more, so nothing in TypeScript can be
// tested for them - the only honest assertion is against a row that a real
// service wrote. Each link is separately plausible and the chain is what
// matters:
//
//   shared/http/actor.ts       holds the actor for the async call chain
//   shared/db/withTransaction  puts it on the connection (set_config, LOCAL)
//   public.audit_stamp         reads it back and writes the six columns
//
// reviews is the subject because it is the smallest table carrying all six and
// its service does nothing but open a transaction and call the repo. Any of
// the twenty-six tables in 116 would do; this is not a fact about reviews.
//
// THE ACTORS ARE REAL USERS, NOT INVENTED UUIDS, and that is not incidental:
// every *_by_id column is a foreign key to auth.users, and the trigger resolves
// the setting against that table before stamping precisely so an unknown id
// leaves the row unattributed instead of raising 23503 and refusing a customer's
// order over an audit field.
import { test } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { runWithActor, currentActor } from "#shared/http/actor.ts";
import withTransaction from "#shared/db/withTransaction.ts";
import * as reviews from "#domain/reviews/service.ts";
import * as reviewsRepo from "#db/reviews/repo.ts";

type Person = { id: string; name: string };

const twoPeople = async (c: PoolClient): Promise<[Person, Person]> => {
  const { rows } = await c.query<Person>(
    `SELECT id, name FROM auth.users WHERE name IS NOT NULL ORDER BY id LIMIT 2`
  );
  assert.equal(rows.length, 2, "auth.users has fewer than two named users - this test proves nothing");
  return [rows[0], rows[1]];
};

const auditOf = async (c: PoolClient, id: string) =>
  (await c.query(
    `SELECT created_at, updated_at, created_by, updated_by, created_by_id, updated_by_id
       FROM reviews.reviews WHERE id = $1`, [id]
  )).rows[0] as Record<string, unknown>;

test("the actor who creates and the actor who edits are both recorded, by the database", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const [alice, bob] = await twoPeople(c);

    const created = await runWithActor(alice.id, () =>
      reviews.create({ name: "Audit probe", review_text: "made by alice", rating: 5, hidden: true })
    );

    const onCreate = await auditOf(c, created.id);
    assert.equal(onCreate.created_by_id, alice.id, "the create did not stamp its actor");
    assert.equal(onCreate.updated_by_id, alice.id, "a new row's last editor is its author");
    assert.equal(onCreate.created_by, alice.name, "the legacy name column went unfilled");
    assert.equal(onCreate.updated_by, alice.name);
    assert.deepEqual(
      onCreate.updated_at, onCreate.created_at,
      "a row that has never been edited must not claim to have been"
    );

    await runWithActor(bob.id, () =>
      reviews.update(created.id, { review_text: "edited by bob" })
    );

    const onUpdate = await auditOf(c, created.id);
    assert.equal(onUpdate.created_by_id, alice.id, "the update rewrote created_by_id");
    assert.equal(onUpdate.created_by, alice.name, "the update rewrote created_by");
    assert.deepEqual(onUpdate.created_at, onCreate.created_at, "the update rewrote created_at");

    assert.equal(onUpdate.updated_by_id, bob.id, "the edit was attributed to the wrong person");
    assert.equal(onUpdate.updated_by, bob.name);
    assert.ok(
      (onUpdate.updated_at as Date) > (onCreate.created_at as Date),
      `updated_at (${onUpdate.updated_at}) did not move past created_at (${onCreate.created_at})`
    );
  });
});

// THE CLOCK, NOT THE TRANSACTION. now() is the transaction's START time and is
// constant within it, so a create and an edit in one transaction would come out
// with identical timestamps and the trail would say the edit never happened.
// The assertion above depends on clock_timestamp() and this says so out loud,
// because "use now()" is the obvious change for someone tidying 116 later.
test("a row created and edited in one transaction still records two different times", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const [alice] = await twoPeople(c);
    const created = await runWithActor(alice.id, () =>
      reviews.create({ name: "Clock probe", review_text: "t", rating: 4, hidden: true })
    );
    await runWithActor(alice.id, () => reviews.update(created.id, { rating: 3 }));

    const row = await auditOf(c, created.id);
    assert.ok(
      (row.updated_at as Date) > (row.created_at as Date),
      "created and edited inside one transaction produced one timestamp - now() is back"
    );
  });
});

// NOBODY IS A REAL ANSWER. A cron sweep and a Stripe webhook run with no
// session, and their writes are unattributed rather than attributed to whoever
// happened to be served last on that pooled connection - which is the failure
// the transaction-local set_config exists to prevent.
test("a write with no actor leaves the author alone rather than inventing one", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const [alice] = await twoPeople(c);
    const created = await runWithActor(alice.id, () =>
      reviews.create({ name: "System probe", review_text: "t", rating: 4, hidden: true })
    );

    assert.equal(currentActor(), null, "the actor escaped its runWithActor scope");
    await reviews.update(created.id, { rating: 2 });

    const row = await auditOf(c, created.id);
    assert.equal(row.updated_by_id, alice.id, "an unattributed write erased the author");
    assert.equal(row.updated_by, alice.name);
  });
});

// The explicit override, for scripts and seeds - anything with no request
// around it. Same claim as the first test, asked of the other entry point.
test("withTransaction takes an actor directly, for callers with no request", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const [alice, bob] = await twoPeople(c);
    const created = await runWithActor(alice.id, () =>
      reviews.create({ name: "Override probe", review_text: "t", rating: 4, hidden: true })
    );

    await withTransaction(
      (client) => reviewsRepo.update(created.id, { rating: 1 }, client),
      { actor: bob.id }
    );

    const row = await auditOf(c, created.id);
    assert.equal(row.updated_by_id, bob.id, "the explicit actor did not reach the connection");
  });
});
