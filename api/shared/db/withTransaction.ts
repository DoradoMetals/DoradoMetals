import pool from "#db";
import type { PoolClient } from "pg";

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
 */
export default async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
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
