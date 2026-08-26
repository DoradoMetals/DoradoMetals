import type { PoolClient } from "pg";

/**
 * Runs fn inside a single database transaction, handing it the client.
 *
 * Declared here rather than converted, matching shared/db/query.d.ts: the
 * twenty-three JavaScript callers keep working unchanged while TypeScript ones
 * get a real client instead of an implicit `any`. Without this, every strict
 * file that opens a transaction has to annotate the parameter by hand, which
 * features/products/service.ts was already doing.
 *
 * The return type flows through from fn, so a caller gets back what its
 * callback returned rather than `unknown`.
 *
 * NOTHING IRREVERSIBLE GOES INSIDE ONE. A transaction can be rolled back; an
 * email, a Stripe charge and a FedEx label cannot. Do the database work, commit,
 * then act on the outside world - shared/db/transaction-side-effects.test.js
 * fails the build if one comes back.
 */
export default function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T>;
