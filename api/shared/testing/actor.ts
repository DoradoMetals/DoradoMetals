// WHO THE DATABASE THINKS IS WRITING, DURING A TEST.
//
// *** THE GAP THIS CLOSES (lane 2). *** Migration 116 moved created_by /
// created_by_id / updated_by / updated_by_id / created_at / updated_at off
// every INSERT and UPDATE and onto one trigger that reads `app.actor_id` from
// the connection. `withTransaction` sets it from the request's actor, so a
// real request stamps correctly - but a REPO test holds the transaction
// itself and never opens one, so before this file every such write was
// stamped by nobody. Of 276 `inPinnedTransaction` calls, exactly ONE named an
// actor. Twenty-six tables' audit stamping was therefore written as
// system-authored and unverified.
//
// *** WHY A SEEDED ROW AND NOT AN INVENTED UUID. *** Every *_by_id column is
// a foreign key to auth.users, and the trigger resolves the setting against
// that table BEFORE stamping - precisely so an unknown id leaves the row
// unattributed instead of raising 23503 and refusing a customer's order over
// an audit field. So an invented uuid does not fail loudly; it silently
// stamps nothing, which is the exact state this lane exists to end. The row
// has to be real.
//
// *** WHY IT IS SEEDED BY THE PREFLIGHT AND NOT BY THE HARNESS. *** Creating
// it inside each pinned transaction would mean every test file INSERTs the
// same primary key at the same moment; the second one blocks on the unique
// index until the first ends, which is a serialization point the lock design
// knows nothing about and a deadlock waiting for a timing change. So
// `scripts/preflight-test-db.ts` commits it once per test database, before
// any test runs, and the harness only ever names it.
//
// If the row is absent (a suite run that skipped the preflight), nothing
// fails: the trigger finds no such user and leaves the columns alone, exactly
// as it does for a cron sweep. The stamping ASSERTIONS use a builder-made
// user through `actingAs` instead, so they do not depend on the seed either.
import type { PoolClient } from "pg";

// Fixed, readable, and outside every real id space. "ac70" is `actor`.
export const TEST_ACTOR = {
  id: "00000000-0000-4000-8000-0000000ac700",
  name: "Test Actor",
  // Sorts last, so a test that still orders users by email does not pick it up.
  email: "zz-test-actor@dorado.test",
} as const;

// THE SECOND NAMED PERSON, and there are exactly two.
//
// A great many tests need a signed-in NOBODY: the caller in a 403 case, the
// other party in "one customer cannot read another's order". Those identities
// are resolved in `beforeAll`, OUTSIDE any transaction, so a builder cannot
// make them - and reusing TEST_ACTOR would collapse the two people a
// two-person test is about into one.
//
// It owns nothing, on purpose. Anything a test needs this person to HAVE - an
// order, an address, a cart - is built inside the transaction instead.
export const TEST_CUSTOMER = {
  id: "00000000-0000-4000-8000-0000000c5700",
  name: "Test Customer",
  email: "zz-test-customer@dorado.test",
} as const;

// What `shared/db/withTransaction.ts` does for a real request, done by hand: a
// repo test holds the transaction itself and never opens one, so nothing else
// puts the actor on the connection.
//
// TRANSACTION-LOCAL (set_config's third argument), for the same reason
// withTransaction is: connections come from a pool, and a session-level
// setting would outlive the test that made it and stamp the next one's rows.
export async function actingAs(c: PoolClient, id: string | null): Promise<void> {
  await c.query("SELECT set_config('app.actor_id', $1, true)", [id ?? ""]);
}
