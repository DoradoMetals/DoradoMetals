# Anonymous checkout — a visitor is a user

Ruling 63, verbatim (Jacob): *"Fuck it, go for it. We'll need it anyway."* and
*"Frontend stores should be for UI elements, not data."*

A signed-out visitor gets a better-auth **anonymous** user on their first basket
touch. From that moment the checkout is ordinary rows under an ordinary user id
— the same tables, the same endpoints, the same rates and readiness a customer
gets. Signing in or signing up links the two accounts on the SERVER and the
checkout follows. **No local basket remains in the browser**:
`shared/store/checkoutItemsStore.ts` is deleted.

---

## 1. What the plugin adds to the schema, and the three guards it needed

better-auth 1.6.9's `anonymous` plugin declares exactly **one** field
(`dist/plugins/anonymous/schema.mjs`): `user.isAnonymous`, boolean, `required:
false`, `input: false`, `defaultValue: false`. better-auth never migrates this
database, so **migration 122** (`122_a_visitor_gets_an_identity.sql`) adds it:

```sql
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS "isAnonymous" boolean NOT NULL DEFAULT false;
CREATE INDEX users_anonymous_stale_idx ON auth.users ("updatedAt") WHERE "isAnonymous";
```

The column is the easy half. **122 also redefines three functions**, and each
one is a hazard the column closes rather than a tidy-up:

| function | why |
|---|---|
| `auth.mirror_identity_to_exchange` (107) | it copies every new `auth.users` row into `exchange.users`. A visitor is not a customer, and ruling 36 froze `exchange` against DELETEs too — so every visitor that ever opened the site would land there permanently. Anonymous rows now stop at the door. |
| `auth.mirror_session_to_exchange` (108) | `exchange.session."userId"` is a foreign key onto `exchange.users`. With the guard above in place and this one missing, an anonymous sign-in raises **23503** and the visitor gets no session at all. The two guards are one change. |
| `public.audit_stamp` (116) | it resolves `app.actor_id` against `auth.users` and stamps `created_by_id`/`updated_by_id`, which are **foreign keys onto `auth.users`**. A visitor's draft fulfillment would point at the visitor, and the sweep that eventually deletes them would raise 23503 forever after. An anonymous actor now resolves to nobody — the same as a cron sweep — which is also the truth: nobody learns anything from "created by Anonymous". |

`exchange` is read by nothing here and written by nothing new: two of those
three only gain an early `RETURN`, so strictly fewer `exchange` rows are written
than before. `lint:migrations` passes (128 files, no destructive writes).

Contracts regenerated: `packages/contracts/src/auth/users.ts` gains
`"isAnonymous": z.boolean()`. `verify:genesis` green — genesis rebuilt and it
matches dev.

## 2. Two things the plugin does NOT do for us (`domain/auth/anonymous.ts`)

**The role.** `additionalFields.role` declares `defaultValue: 'user'`, and
better-auth applies additionalFields defaults in `parseInputData` — which runs
on the **sign-up route's body**, not inside `internalAdapter.createUser`. The
anonymous plugin calls `createUser` directly with a literal object, so `role`
lands NULL and `authMiddleware`'s ladder scores the visitor at 0, below `user`.
**Every checkout route would 403.** A root `databaseHooks.user.create.before`
fills it in, past which no create goes.

**No Stripe customer for a visitor.** `@better-auth/stripe`'s
`createCustomerOnSignUp: true` registers a `databaseHooks.user.create.after`
that searches Stripe by email and creates a customer when it finds none. It
fires for every user better-auth creates — so, after ruling 63, for every
visitor who touches a basket: junk customers named "Anonymous" at
`temp-…@anonymous.dorado.invalid`, and **two Stripe round-trips inside the
request that adds the first item to a basket**, which also makes "can this
visitor shop" depend on Stripe being reachable.

There is no option for it: the plugin's guard is
`!options.createCustomerOnSignUp || user.stripeCustomerId`, and turning the
boolean off would take the customer away from real sign-ups too. The other way
to satisfy that guard is to write a fake Stripe id into `stripeCustomerId`,
which is a lie in a column the payments feature reads. So the plugin's own hook
is wrapped and skipped for `isAnonymous` users. **It is monkeypatching**, and
`domain/auth/tests/anonymous.test.ts` is what keeps it honest — it asserts
against `@better-auth/stripe`'s own build that the hook is still where the
wrapper reaches, so a version bump fails `pnpm check` rather than every visitor
arriving in Stripe afterwards.

`config-options.test.ts` now also checks the anonymous plugin's **own** options
(`emailDomainName`, `onLinkAccount`, `disableDeleteAnonymousUser`) against
better-auth's build — a plugin's options are exactly as easy to misspell as the
root ones, and a typo in the last of those would silently put the visitor's
deletion back inside a customer's sign-in.

## 3. `disableDeleteAnonymousUser: true` — the delete is the sweep's

Left to itself the plugin deletes the anonymous user in the same response hook,
immediately after `onLinkAccount`. **Every foreign key onto `auth.users` is NO
ACTION**, so one row still pointing at that visitor — an address link, a draft
fulfillment, anything a later feature adds — turns a customer's **sign-in** into
a 500. That is the worst place in the application to put a failure that only
shows up on production data.

Deferring the delete to a sweep converts that whole class of bug from "a
customer cannot get into their account" into "a row lingers for another seven
days".

## 4. The merge rule (`domain/checkout/rules.ts` `mergeChoices`)

`onLinkAccount` calls `adoptAnonymousCheckout({ anonymousUserId, userId })`
(`domain/checkout/adopt.ts`).

- **No row on the real account for that direction** → the visitor's row is
  **re-keyed**, not copied. Same row id, so anything already holding it still
  resolves; the lines and the choices come with it for free.
- **The customer already has a row** → the CUSTOMER's row survives (it is the
  one every other reference points at) and takes:
  - **the choices, column by column, `anonymous ?? real`.** The visitor's choice
    wins where they made one — those were made seconds ago, in the session on
    screen. The customer's saved answer wins where the visitor has none, so
    signing in is a merge and not a reset.
  - **the basket, outright.** A basket is a SET the customer is looking at, not
    a bag of independent choices; merging two produces a basket nobody
    assembled. The count of lines replaced is reported back as `replaced`.
- **The address book moves too.** `places.user_addresses` is re-keyed (the
  shared `places.addresses` rows are not). Without it, `patchCheckout` would
  refuse the very address the customer's own row points at.
- **It never throws at the caller.** It runs inside better-auth's sign-in
  response hook, so it goes through `shared/attempt.ts`: a basket is device-sync
  and can be rebuilt; a sign-in that throws is a customer locked out.

`CHOICE_COLUMNS` restates `checkouts.PATCHABLE` rather than importing it (the
rules module is pure and must stay in the no-database test lane); the two are
pinned equal by `tests/adopt.test.ts`.

## 5. The two walls

Everything works for a visitor except the two things that create something which
outlives the session and cannot be re-done:

- **`place`** — `domain/orders/place.ts`, on the checkout row's OWNER (an admin
  placing a customer's checkout is asking about the customer):
  `Forbidden("sign in to place an order")`.
- **The payout step** — `saveCheckoutPayout`: bank numbers are sealed at rest
  against a user id, and a visitor's is about to be swept.
  `Forbidden("sign in to save a payout account")`.

Both are `Forbidden`, not 401: the caller has a perfectly good session, and the
UI turns this into the sign-in prompt rather than a logged-out state.
`domain/checkout/service.ts` `assertRealAccount` is the one guard behind both.

## 6. The sweep (`domain/checkout/sweep.ts`)

`sweepAnonymousVisitors({ days = 7, limit = 5000 })`, registered in
`shared/cron/scheduler.ts` beside the settled-intent sweep and gated on
**`ANONYMOUS_SWEEP_SCHEDULE`** — *a new environment variable; unset, the job
runs once at boot and never on a timer, which is the existing scheduler's
documented behaviour.* Same test the settled sweep passes: idempotent, moves no
money, everything it can reach is device-sync.

**Last seen is the newest of three traces** — the user row (the moment the
visitor arrived; nothing ever updates it), their newest session (still
browsing), their newest basket line (still shopping). A linked visitor stops
accruing traces at the moment of linking and falls out on the next sweep after
the window.

The delete is **one statement** with data-modifying CTEs
(`db/users/anonymous/sql/delete.sql`): checkout rows (items cascade), address
book links, sessions, credentials, then the user. Every FK onto `auth.users` is
NO ACTION, whose referential check is an AFTER-ROW trigger queued to the **end
of the statement**, so the referencing rows are already gone by the time the
check on `auth.users` runs. `AND "isAnonymous"` appears in **both** the listing
and the delete: it is what makes the only DELETE of a user row in this codebase
incapable of reaching a customer, whatever id it is handed.

## 7. The frontend — one copy of the basket, and it is the server's

- **Deleted**: `shared/store/checkoutItemsStore.ts` and its test. The line
  arithmetic survived as `features/checkout/items/basket.ts` (`addLine`,
  `removeOne`, `removeAll`, `collapse`) — that is a request being composed for a
  PUT that REPLACES, not data being kept.
- **`features/checkout/items/queries.ts`** lost `hydrateCheckoutItems` and every
  signed-in/signed-out branch. `useBasket` answers the server's rows, full stop.
- **`packages/client/src/session.ts`** is new: `configureSession` /
  `ensureSession` / `forgetSession`. Every checkout **mutation** awaits
  `ensureSession()` first — that is the "first basket touch". **Reads do not**,
  so opening a page never mints a visitor; they stay gated on a session that
  already exists. Concurrent callers share one attempt, or two clicks in the
  same tick would mint two anonymous users and lose the first one's basket. The
  package still imports nothing but contracts, react and react-query
  (`lint:client-boundary`): the host registers the one call.
- **`features/auth/authClient.ts`** adds `anonymousClient()` and registers that
  call (`getSession`, then `signIn.anonymous()` when there is nobody).
- **`features/auth/queries.ts`**: sign-in/sign-up/social/impersonation no longer
  hydrate or merge anything — the server linked the basket before the response
  was written. Sign-out no longer pushes the local basket up first (there is
  none) and calls `forgetSession()`.
- Consumers updated: `Shell` (the badge counts server rows), `ProductCard`,
  `BullionCard`, `ProductPageDetails`, scrap `ReviewStep`, both checkout review
  surfaces, the customer sale placement, the admin sale drawer.
- The sale checkout clears its basket through the API after placing; the
  purchase side already does it server-side inside `place`.

## 8. Tests

| file | lane | what it pins |
|---|---|---|
| `api domain/checkout/tests/anonymous-checkout.test.ts` | http | the journey: basket → the rate surface's own refusals → `ready_for_rates` → payout refused → placement refused → sign-up → the same row, re-keyed, with the basket and the address on it, and nothing left on the visitor. Plus: a visitor's writes are attributed to nobody, and a real customer still is (the control). |
| `api domain/checkout/tests/adopt.test.ts` | db | re-key vs merge, both directions, the address book, self-link, empty visitor, and `CHOICE_COLUMNS == checkouts.PATCHABLE`. |
| `api domain/checkout/tests/sweep.test.ts` | db | a stale visitor and everything hanging off them; a visitor still shopping; **a customer is never a candidate, however old**; naming a customer's id directly still deletes nothing; an empty sweep. |
| `api domain/checkout/tests/rules.test.ts` | unit | the merge rule as arithmetic, including "a visitor who chose nothing cannot blank a saved choice". |
| `api domain/auth/tests/anonymous.test.ts` | unit | the role default, the Stripe wrapper, and the two pins against the real `@better-auth/stripe` and `better-auth` builds. |
| `frontend features/checkout/items/basket.test.ts` | node | the line arithmetic, now including "the input list is never mutated" (it is the query cache's own rows). |
| `frontend shared/tests/checkoutServer.ts` | — | an in-memory `/checkout/items` so `ProductCards` and `OrderSummary` render tests exercise the REAL hooks and cache instead of a mocked feature module. |
| `frontend shared/tests/anonymous-basket.e2e.ts` | e2e, **never executed** | a signed-out visitor's basket reaching the API. Written in a lane that does not run Playwright; selectors copied from the two authed checkout specs, which do run. |

## 8b. Smoke-tested against dev, once, for real

The suite mocks the session (better-auth builds its own Pool and a real sign-in
would have to COMMIT), so one throwaway `POST /api/auth/sign-in/anonymous` was
run against the dev database through `#app` — no scheduler, no browser — and its
row deleted again by the sweep's own statement. It answered **200** with
`role: 'user'` (the databaseHooks fix), `isAnonymous: true` (the column, under
that exact spelling), `emailVerified: false`, and an
`@anonymous.dorado.invalid` address; **`exchange.users` and `exchange.session`
held 0 rows for it** (migration 122's two mirror guards); the sweep's
one-statement delete took the user and its session, leaving dev as it was found.

## 9. Left, deliberately

- **`ANONYMOUS_SWEEP_SCHEDULE` is not in `api/.env`** — this lane does not edit
  `.env`. Until it is set the sweep runs once at boot and not on a timer.
- **A linked visitor's row survives until the sweep.** That is the
  `disableDeleteAnonymousUser` trade above, taken on purpose.
- **Orphaned draft fulfillments.** Deleting a visitor's checkout row leaves the
  `fulfillments.fulfillments` draft it pointed at, exactly as `resetAfterOrder`
  already does for a customer. Pre-existing; a native cascade purge is still
  future work.
- **The live carrier call is not driven for a visitor** — no cassette matches
  `GET /checkout/rates`'s own request shape (see
  `domain/shipping/operations/tests/checkout-rates.test.ts`'s header). What is
  pinned instead is that a visitor reaches the SAME refusals and the same
  `ready_for_rates`; the endpoint does not branch on who is asking.
- **Production.** Migration 122 has run on **dev only**. On production it is
  part of the `pg_dump` → migrate → backfill → verify → merge sequence, which is
  Jacob's.
