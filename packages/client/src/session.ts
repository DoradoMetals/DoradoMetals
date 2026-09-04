// THERE IS ALWAYS A SESSION (ruling 63: "Fuck it, go for it. We'll need it
// anyway." / "Frontend stores should be for UI elements, not data.").
//
// The checkout is server rows under a user id, for a signed-out visitor as much
// as for a customer: the API gives a visitor an ANONYMOUS better-auth user on
// their first basket touch, and the browser holds no basket of its own. So
// every write below has one precondition - somebody, anybody, is signed in -
// and this is where that precondition is met.
//
// THIS PACKAGE KNOWS NOTHING ABOUT AUTH, and may not: it is allowed to import
// `@dorado/contracts`, `react` and `@tanstack/react-query`, and nothing else
// (api/scripts/lint-client-boundary.ts). better-auth's client lives in the
// HOST, which registers the one call this needs. Unregistered, `ensureSession`
// is a no-op and the API answers 401 exactly as it did before - a host that
// forgets to wire it gets the old behaviour, not a broken one.
//
// IT IS NOT A STORE. Nothing here holds checkout data, or any data: one
// function reference and two flags about work in flight. `known` is the whole
// optimisation - a session is confirmed once per page rather than re-asked
// before every click - and `forgetSession` is what signing out calls so the
// next basket touch asks again.

type EnsureSession = () => Promise<unknown>;

let ensure: EnsureSession | null = null;
let known = false;
let inFlight: Promise<unknown> | null = null;

/** The host's "make sure somebody is signed in" - typically a `getSession`
 *  followed by `signIn.anonymous()` when there is nobody. Called once. */
export function configureSession(fn: EnsureSession): void {
  ensure = fn;
  known = false;
  inFlight = null;
}

/** Signing out invalidates what `ensureSession` learned. Without this a
 *  customer who signs out keeps a `known` session that no longer exists, and
 *  their next basket touch 401s instead of becoming a visitor's. */
export function forgetSession(): void {
  known = false;
  inFlight = null;
}

/** Awaited before any checkout write. Concurrent callers share one attempt:
 *  two clicks in the same tick would otherwise mint two anonymous users, of
 *  which only the last cookie survives - and the first one's basket with it. */
export async function ensureSession(): Promise<void> {
  if (known || !ensure) return;
  if (!inFlight) {
    inFlight = ensure()
      .then((result) => { known = true; return result; })
      .finally(() => { inFlight = null; });
  }
  await inFlight;
}
