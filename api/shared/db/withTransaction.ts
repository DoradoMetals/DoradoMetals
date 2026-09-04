import pool from "#pool";
import type { PoolClient } from "pg";
import { currentActor } from "#shared/http/actor.ts";

/**
 * Runs fn inside a single database transaction, handing it the client.
 *
 * Checks out a client, issues BEGIN, and hands the client to fn. Commits if fn
 * returns, rolls back and rethrows if it throws. The client is always released.
 * The return type flows through from fn, so a caller gets back what its
 * callback returned rather than `unknown`.
 *
 * Repos take an optional client/executor as their last argument, so pass the
 * client straight through:
 *
 *   return withTransaction(async (client) => {
 *     await orderRepo.insert(order, client);
 *     await itemRepo.insertMany(items, client);
 *   });
 *
 * NOTHING IRREVERSIBLE GOES INSIDE ONE. A transaction can be rolled back; an
 * email, a Stripe charge and a FedEx label cannot. Do the database work, commit,
 * then act on the outside world - shared/db/tests/transaction-side-effects.test.ts
 * fails the build if one comes back.
 *
 * ---------------------------------------------------------------------------
 * WHO IS DOING THIS, PUT ON THE CONNECTION.
 *
 * Right after BEGIN this sets `app.actor_id` from shared/http/actor.ts, and
 * the public.audit_stamp trigger reads it to fill created_by_id / updated_by_id
 * (and the legacy name columns). That is why no repo takes an actor argument
 * any more: the value travels on the connection, not through fourteen
 * signatures.
 *
 * *** THE `true` IN set_config IS THE WHOLE SAFETY ARGUMENT AND MUST NOT BE
 * DROPPED. *** It means transaction-local: Postgres reverts the setting when
 * the transaction ends. Connections here come from a POOL and are handed to
 * whoever asks next, so a session-level setting would outlive the request that
 * made it and stamp the NEXT customer's rows with the PREVIOUS customer's id -
 * silently, and only under load, which is the shape of bug that never shows up
 * in a test. Transaction-local cannot leak, because there is no moment at
 * which the connection is both idle and still carrying a value.
 *
 * IT IS ISSUED EVEN WHEN THE ACTOR IS NULL, which costs one round trip and buys
 * the reset. In production the connection is always fresh out of BEGIN so
 * skipping would be safe - but shared/testing/pinned-pool.ts runs a whole test
 * file's requests inside ONE outer transaction, rewriting BEGIN to a SAVEPOINT,
 * and there a skipped statement leaves the previous request's actor in place.
 * Writing '' clears it; the trigger reads an empty string as "no actor".
 */
export default async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
  // The explicit override, for scripts, seeds and tests - anything with no
  // request around it. `runWithActor(id, () => withTransaction(fn))` says the
  // same thing and is what a caller with several transactions should use; this
  // is the one-call form.
  { actor }: { actor?: string | null } = {}
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.actor_id', $1, true)", [
      actor ?? currentActor() ?? "",
    ]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
