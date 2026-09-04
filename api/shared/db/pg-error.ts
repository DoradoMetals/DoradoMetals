// THE ONE PLACE A POSTGRES ERROR BECOMES A DOMAIN REFUSAL.
//
// Ruling 52 put it here: "A pg error that must become a refusal is translated
// in withTransaction's catch, never in a service." Ruling 64 is what made it
// necessary - a "this row must be yours" check written as a loop in TypeScript
// is a foreign key spelled in the wrong language, so the checks moved into the
// schema (migration 123) and the error they now raise has to arrive at the
// caller as the same 422 the loop gave.
//
// *** ONE DIRECTION ONLY, AND THE DIRECTION IS THE WHOLE POINT. *** 23503 is
// raised by two different mistakes and Postgres tells them apart in `detail`:
//
//   "Key (package_id)=(...) is not present in table ..."   a WRITE naming a
//     row that is not there - the caller's mistake, and the one the schema now
//     catches on the caller's behalf. Translated.
//
//   "Key (id)=(...) is still referenced from table ..."    a DELETE of a row
//     something else needs - not a bad request but a state the caller has to
//     resolve. Left alone deliberately: it reaches the caller as 500 today and
//     the surfaces that raise it (domain/shipping/services/service.ts's
//     removeService) document and test that. Making it a Conflict is a real
//     improvement and a separate decision, because it changes a status.
//
// Nothing else is translated. A unique violation, a not-null violation and a
// bad cast are all faults until somebody decides otherwise for each, and a
// translator that guesses turns a 500 that says "look at this" into a 4xx that
// says "your fault".
import { Invalid } from "#shared/errors.ts";

// `Key (user_id, recipient_address_id)=(a, b) is not present in table "..."`
const MISSING_KEY = /^Key \(([^)]+)\)=.* is not present in table/;

type PgError = { code?: unknown; detail?: unknown };

// The columns the caller got wrong. A composite key carries the row's OWNER
// alongside the id the caller actually named, and naming user_id back at them
// would be telling a customer their own id is the problem - so it is dropped
// whenever the key has anything else in it.
function namedColumns(detail: string): string | null {
  const match = MISSING_KEY.exec(detail);
  if (!match) return null;
  const columns = match[1].split(",").map((c) => c.trim()).filter(Boolean);
  const theirs = columns.length > 1 ? columns.filter((c) => c !== "user_id") : columns;
  return theirs.length ? theirs.join(", ") : null;
}

/**
 * The error to rethrow. Answers the SAME error object for anything it does not
 * translate, so a caller writes `throw asDomainError(err)` with no branch.
 */
export function asDomainError(err: unknown): unknown {
  const pg = (err ?? {}) as PgError;
  if (pg.code !== "23503" || typeof pg.detail !== "string") return err;
  const columns = namedColumns(pg.detail);
  return columns ? new Invalid(`${columns}: no such row`) : err;
}
