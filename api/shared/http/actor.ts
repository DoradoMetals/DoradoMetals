// WHO is doing this, carried without being passed.
//
// THE PROBLEM IT REPLACES. Every audit column used to travel as an argument:
// `create(row, actor, executor)`, `update(id, patch, actor, executor)`, a
// `user_name` field on a request body, `updated_by` spread into a patch. That
// is one parameter per repo, one more on every service between the controller
// and the table, and a hole wherever somebody forgot - a write with no author
// looks exactly like a write by nobody, and neither the types nor the database
// could tell them apart. Jacob's ruling: the DATABASE stamps the row.
//
// So the actor is ambient. The auth middleware puts the session's user id in
// this store for the rest of the request; `withTransaction` reads it and sets
// `app.actor_id` on the connection; the `public.audit_stamp` trigger reads that
// and writes created_by_id / updated_by_id / created_by / updated_by itself.
// Nothing in between mentions an author.
//
// AsyncLocalStorage rather than a module-level variable, because Node serves
// requests concurrently: a plain `let current` would be overwritten by whatever
// request happened to run next, and one customer's edit would be stamped with
// another customer's id. The store follows the async call chain instead, so a
// value set for one request is invisible to every other.
//
// NULL IS A REAL ANSWER, not a missing one. An unauthenticated request, a cron
// sweep and a Stripe webhook all run with no actor, and the row they write
// reads as system-authored. That is the truth about those writes: nobody
// pressed a button.
import { AsyncLocalStorage } from "node:async_hooks";

export type ActorContext = { actor_id: string | null };

const storage = new AsyncLocalStorage<ActorContext>();

/**
 * Runs fn - and everything it awaits - with this actor in scope.
 *
 *   runWithActor(session.user.id, () => next());
 *
 * Nesting is allowed and the innermost wins, which is what lets a script or a
 * test override the ambient actor for one call.
 */
export function runWithActor<T>(actor_id: string | null, fn: () => T): T {
  return storage.run({ actor_id }, fn);
}

/**
 * The actor in scope, or null outside a request (cron, webhooks, scripts).
 * Never throws: a caller that has no actor is a normal case, not an error.
 */
export function currentActor(): string | null {
  return storage.getStore()?.actor_id ?? null;
}
