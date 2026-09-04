# places + users — the feature end to end

Jacob's brief, the same one orders, checkout and fulfillments ran under:
*"Start rolling through features on the API, get rid of any types that are
present. Figure out how to get rid of any prop spreading. Resources come from
the server (unless they really can't). … Look at the frontend counterparts at
the same time. Is there business logic on the frontend? Remove it to the API.
Don't be afraid to change frontend code entirely."*

One lane, because an address book is one question asked from two sides: **where
does this customer's parcel go, and who signs for it.** `places` owns the
postal row and the person's link to it; `users` and `auth` own the person.

---

## 1. `recipient_name` — the decision, and the finding under it

CLAUDE.md carried this as the one live blocker under places:
`exchange.addresses` has `name`, `places.addresses` has none,
`places.user_addresses` has `label` — "a book nickname (Home), not a
recipient" — so repointing the order composer at places would silently blank
every `recipient_name`.

**Two things turned out to be true, both measured on dev 2026-09-04.**

1. **The consumer is gone.** The orders lane replaced `compose.ts` /
   `read.service.ts` with `domain/orders/read.ts` + `OrderView`, and the FedEx
   contact is `order.user.name` now — the account's own name. Nothing in `api/`
   reads a `recipient_name`; the only surviving mention is a comment in
   `media/pdfs/render/sections.ts`. So this stopped being a regression waiting
   to happen and became a missing column with no consumer.
2. **The value was never lost.** `050_backfill_addresses.sql` maps
   `exchange.addresses.name` → `places.user_addresses.label`, and all **23** dev
   rows match their exchange source exactly, same user, 23 distinct values —
   and every real one is a PERSON ("Barry Adler", "Scott Lohman", "Jacob
   Johnson"), not a nickname. `label` had been carrying the recipient under the
   wrong name all along, while the form asked for it as "Address Name" with the
   placeholder "Home".

**THE DECISION: `recipient_name` goes on `places.user_addresses`, beside
`label`.** Migration `126_a_parcel_has_a_recipient.sql`.

- `places.addresses` is deliberately ownerless and **shared** — `user_addresses`
  exists precisely so two people can point at one postal row, and
  `addresses.remove` only deletes the row when nothing points at it. A recipient
  on the shared row means one person's edit renames the other person's parcel.
- `places.addresses` is also what `snapshot.sql` **freezes** onto an order. A
  recipient there would be frozen by whoever wrote last, not by whoever placed
  the order.
- `exchange.addresses` — the source of the value — carries `user_id`, so an
  exchange address row **is** a per-person row. Its native successor is
  `user_addresses`, one link per (user, address). The backfill is exact rather
  than a guess: 23 of 23, joined on `(address_id, user_id)`.

The migration is additive — one nullable column, one fill from `exchange`
(read-only), one fallback from `label` for rows exchange never had. Nothing is
dropped, `label` keeps every value it holds, and **`(user_id, address_id)` is
untouched**, so the composite FK the cleanup lane is adding still resolves.

**Numbered 126, not 123.** The cleanup lane applied `123_addresses_are_theirs`,
`124_one_key_for_the_address_book` and `125_the_book_and_the_basket_move_together`
to the shared dev database while this lane ran; the first spelling of this file
collided with their 123. Re-applying under the new name is safe and is what
happened — `ADD COLUMN IF NOT EXISTS`, and a fill scoped to
`recipient_name IS NULL`.

## 2. What moved server-side

Every one of these was a decision about the business, taken in a browser.

| the rule | where it was | where it is |
|---|---|---|
| the first address in a book is the default | `mustBeDefault = isNewAddress && addresses.length === 0`, with a disabled Switch enforcing it | `rules.defaultOnCreate` — applied whatever a client sends |
| whether an address may still be edited or deleted | not asked: Edit and Remove were on every card, the API answered 409, the card rendered it as red text | `rules.actionsFor` → `entry.actions.edit` / `.remove` |
| whether "Set Default" is earned | `!userAddress?.default_shipping`, from a list joined client-side | `entry.actions.set_default` |
| the book's order | `[...addresses].sort()` in `AddressList`, and a **second, different** sort in `shippingSelect` | `rules.byDefaultThenRecipient`, server-side |
| joining an address to its link | a `Map` built per screen from two endpoints | one `AddressBookEntry` |
| what a Google suggestion means | `utils/places.ts` — 90 lines walking a components array, four spellings of one string | `providers/places/google.ts` |
| where the map should centre | a **second** billed Google surface (`useGeocoder`) re-finding an address the picker had just resolved | `PlaceLookup.latitude/longitude`, from the same lookup |
| editing an address un-validates it | `verifyAddress(form, false)` | `rules.editedColumns` |
| one flag setting two columns | the repo forced `default_billing` to follow whatever `default_shipping` was passed | `set_default_{clear,mark}.sql`, and nowhere else |

`api/domain/places/addresses/rules.ts` holds all of it, pure over rows already
loaded, tested without Postgres.

## 3. The view

```
AddressBookEntry = { address, user_address, actions }
AddressBookActions = { edit, remove, set_default }
```

In `packages/contracts/src/computed/places.ts`, declared in
`lint:contracts-derived`'s COMPUTED map, because no table backs a decision.

**ROWS, NOT PROJECTIONS.** `address` is the postal row itself and
`user_address` the link row — the two stay apart on the wire, because a link
nested inside an address is the smearing the places split exists to end.

**Every action mirrors the refusal its use case makes**, so a button that is
offered is a call that is accepted. `actions.edit === false` and
`assertNotOnAnActiveOrder` are eleven lines apart in one file.

## 4. The Google key left the browser

It ran as `google.maps.places.AutocompleteSuggestion` and `place.fetchFields`,
driven by `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — a key shipped to every visitor,
billed per keystroke, with nothing server-side able to see, cap or refuse the
spend. Two endpoints now:

| endpoint | answers |
|---|---|
| `GET /api/addresses/suggestions?q=&session_token=` | `PlaceSuggestion[]` |
| `GET /api/addresses/suggestions/:place_id?session_token=` | `PlaceLookup` — the same patch a create would send, plus lat/lng |

`rules.assertSearchText` refuses a query under three characters **before** the
billed call; the browser used to gate that with `length > 2` and a debounce,
both of which a caller could simply not do. `session_token` passes through so a
burst of keystrokes and the pick that follows are one billed session.

**The cassette is HAND-AUTHORED, and that is stated in the test.** Every other
cassette in `api/tests/cassettes` was recorded against a real sandbox. Google
Places has no sandbox: the only way to record one is a live, billed request with
a real key, and this lane was told never to use live keys in a test. So
`places/autocomplete-and-lookup.json` is written from Google's documented Places
API (New) shapes and holds no key, no real place id and no real address. That
costs the one thing a recording buys — proof the shape is really Google's — and
keeps everything else: the payload the adapter builds, the mapping of the
answer, and the certainty that no test reaches the network. Its three
suggestions are the three cases the browser's parser had to handle and the two
it silently dropped.

The API reads `GOOGLE_PLACES_API_KEY`. **It is not in `api/.env`** (this lane
does not edit `.env`), so the two endpoints answer 500 until it is set; nothing
else in the app depends on them.

## 5. Wire changes (ruling 44 — the frontend informs nothing)

REST, D214 item 4: the verb is the METHOD and the resource is named once, in the
path.

| was | is |
|---|---|
| `GET /addresses/get` + `GET /addresses/get_user_addresses` | `GET /api/addresses` → `AddressBookEntry[]` (**two endpoints became one**) |
| — | `GET /api/addresses/:id` → one entry |
| `POST /addresses/create` | `POST /api/addresses` → **201** + the entry |
| `POST /addresses/update` | `PATCH /api/addresses/:id` |
| `DELETE /addresses/delete` (body `{address_id}`) | `DELETE /api/addresses/:id` → **the entry it removed**, was the string `"Deleted address."` |
| `POST /addresses/set_default` | `POST /api/addresses/:id/default` |
| — | `GET /api/addresses/suggestions`, `/suggestions/:place_id` |
| `GET /users/get_user?user_id=` | `GET /api/users/:id` |
| `GET /users/get_all_users` | `GET /api/users` |
| `GET /users/get_admin_users` | `GET /api/users/admins` |
| `POST /users/update_credit` (body carries `user_id`) | `POST /api/users/:id/credit` |

Bodies: `AddressCreateBody`/`AddressUpdateBody`/`AddressIdBody` collapse into one
**`AddressWriteBody`** (`{ address?, user_address? }`) — no `id` inside the patch,
no `user_id` in any body. **`?user_id=` is how an admin says whose book**, on
every verb; a non-admin sending one is overridden by the session.
`UpdateCreditBody` loses `user_id` for the same reason.

`UserAddressRead` gains `recipient_name` and loses the two `.nullable()`
widenings it carried so the browser could fake a link object. `UserAddressPatch`
is `{ recipient_name?, label?, default_shipping? }`.

## 6. Ruling 65 — no `throw` in a service

`domain/places/addresses/service.ts` went **4 → 0**; its ACCEPTED entry is
deleted and the outstanding total falls from 84 to 80. Each throw became a named
assert next to the action it mirrors: `assertInBook`, `assertAddress`,
`assertNotOnAnActiveOrder`, `assertSearchText`.

Two of them changed behaviour, deliberately:

- **A stranger's DELETE is a 404 now, not a 200.** `remove` only ever touched
  the caller's own link, so it answered "Deleted address." having deleted
  nothing — a real delete and a stranger's were indistinguishable to every
  caller. `assertInBook` runs first. `audit:silent-mutations`' CEILING comes
  down 15 → 14 with it.
- **Editing an address no longer costs it its default.** `update` wrote
  `default_shipping: false` before deciding whether to set it, so renaming the
  recipient of the default address silently un-defaulted it. Neither flag is in
  the link patch any more; turning one on goes through `setDefault`'s
  clear-then-mark, which is also the only place `default_billing` follows
  `default_shipping`.

## 7. Ruling 64 / ruling 56 / no spreading

- Both `db/places` repos derive `PATCHABLE` from a contract:
  `AddressWriteColumns` and `UserAddressWriteColumns`, each an `.omit()` of its
  generated entity. `NewAddress`, `NewUserAddress`, `AddressPatch` (the repo's
  hand-written copy), `UserAddressPatch` (ditto) and `AddressInput` /
  `UserAddressInput` are all deleted — the domain declares no write shape at all
  now, which is what the lint change in §9 is about.
- `addresses.update` answers the ROW (`RETURNING *`), not a boolean.
- Every write in the service opens exactly one `withTransaction` and threads
  `tx`; the `executor ? run(executor) : withTransaction(run)` idiom is gone from
  all five.
- No object spread anywhere in the new API code; `rules.entry`, `rules.linkColumns`
  and `rules.editedColumns` name their fields.

## 8. The client package and the customer UI

`packages/client/src/addresses/` (9 hooks) and `src/auth/` (2). `keys.addresses`
has **one** book key, because there is one read: the two lists the browser used
to join by `address_id` cannot drift apart in a cache if there is only one.

`frontend/features/auth` **left `lint:client-boundary`'s PENDING list** — its
two `apiRequest` calls (`/account/set_password`, `/recaptcha/verify-recaptcha`)
are hooks now, and better-auth keeps its own client, which is its business and
not an API call this package should wrap. 9 pending surfaces → 8.

`frontend/features/addresses/queries.ts` is a re-export plus four projection
hooks (`useAddress`, `useUserAddresses`, `useUserAddress`,
`useUserAddressLinks`), kept for the same reason `features/shipping/queries.ts`
is: the checkout and orders lanes import those names. They are the shim, not the
shape, and they go when those lanes adopt `useAddressBook`.

Deleted outright: `hooks/useGeocoder.ts`, `utils/places.ts`, `utils/form.ts`,
`utils/places.test.ts`, and `splitFormValues` / the `PlacesJs*` type family from
`types.ts`. What is left in `types.ts` is FORM validation and the state map.

`AddressSelect` draws its own two-line row instead of an `AddressCard`: a picker
shows a choice and does nothing to it, so it should not be handed an entry (and
its props stay `Address[]` + `UserAddress[]`, which is what its callers hold).

## 9. `lint:input-shapes`' floor, corrected

The lint failed with **"SCAN IS BROKEN: no write-facing input shapes found"**
after `AddressInput`/`UserAddressInput` were deleted — they were the last two in
`api/domain/**`. `inScope === 0` stopped being a floor the day it became the
goal, and a guard that fails when the codebase reaches the state it was written
to push it toward is a guard that gets worked around.

What still has to hold is that the SCAN works, and the builder half proves that
with a **known-present control**: ten `Options` types it finds and accepts every
run. The floor is now `domainScanned === 0 || buildersScanned === 0 ||
acceptedHit.size === 0`. Self-test still passes 4/4.

## 10. Verification

| gate | result |
|---|---|
| `pnpm check:fast` | PASS but for `figma:inventory` (Jacob's map, not this lane's) |
| `pnpm --filter @dorado/api lint:migrations` | 129 files, no destructive writes to exchange |
| `migrate` (dev) | `126_a_parcel_has_a_recipient.sql` applied; 23/23 rows filled, 0 differ from `label` |
| `dump:schema` + contracts `generate` + `build` | clean; genesis gains one nullable column |
| `verify:genesis` | **1 difference, and it is not this lane's** — see below |
| `pnpm --filter @dorado/api test` | 222 files, 1311 passed, 1 skipped |
| `pnpm --filter @dorado/api validate:wire` | 27 shapes match, 0 diverge, 3 skipped for want of a fixture |
| `pnpm --filter @dorado/client typecheck` + `test` | 0, 24 passed |
| `pnpm --filter @dorado/frontend typecheck` + `test` | 0, 35 files / 192 passed |
| `domain/auth/tests/config-options.test.ts` | green (in the suite) |

**`verify:genesis`'s one difference is the cleanup lane's, on the shared dev
database.** Their `124_one_key_for_the_address_book.sql` replaced
`places.user_addresses`' unique INDEX on `(user_id, address_id)` with a unique
CONSTRAINT, which is what a composite FK needs to reference. That migration is
not in this worktree, so this branch's genesis cannot carry it, and running
`dump:schema` again would only claim their change inside this diff. It goes
green when their branch merges. This lane's own column matches dev exactly.

## 11. Files outside this lane that had to move with it

Nothing here is a rework — each is a call site of a type or a hook this lane
owns, changed in the same diff because leaving it broken is not an option.

- **`api/domain/checkout/service.ts`** (checkout lane) — three lines:
  `addressService.list` answers entries, so `a.is_valid` is `e.address.is_valid`.
- **`frontend/features/checkout/purchase-order-checkout/shippingStep/shippingStep.tsx`**
  and **`.../sales-order-checkout/shipping/shippingSelect.tsx`** (checkout lane)
  — three lines each: `AddressDrawer`'s `onSuccess` takes the entry.
- **`api/domain/orders/tests/address-state.test.ts`** (orders lane, test only) —
  one test DELETED with a note in its place. It pinned that `getFromId` returns
  a LIST, which is the shape that made the `.state`-off-a-list defect writable;
  `getFromId` is gone and there is one read of a postal row by id now. The two
  tests that pin the defect itself are untouched.
- **ADMIN FRONTEND (frozen — import swaps and one call shape only), 1 file:**
  `frontend/features/users/ui/UsersDrawer.tsx` —
  `updateCredit.mutate({ user_id, op, amount })` becomes
  `({ user_id, body: { op, amount } })`. No other admin file was touched.
- **`frontend/shared/store/drawerStore.ts`** and **`frontend/shared/queries/keys.ts`**
  — the drawer's two address slots become one `addressEntry`; the `places(...)`
  query key is the client package's now.
- **`packages/client/src/users/queries.ts`** and its test — the four users URLs.

## 12. Left for someone else

- **`frontend/features/users/types.ts`'s `userSchema` is still a hand-written
  copy of better-auth's session user**, and it is the one frontend schema
  `audit:frontend-nullability` marks PARSED AT RUNTIME. Its second job is inside
  the orders lane's `adminSalesOrderCheckoutSchema`, so splitting the form
  schema from the parsed one is that lane's call, not this one's. The file's own
  header already states the problem.
- **`GOOGLE_PLACES_API_KEY` is not set on dev.** Setting it is Jacob's
  (`api/.env` is not this lane's to edit). Until then the two suggestion
  endpoints answer 500 and the drawer's manual-entry mode is the working path.
- **`places/locations` still has no application consumer** (D214 item 7);
  untouched.
- **`customer-address-crud.e2e.ts` and `customer-addresses.e2e.ts` are DELETED.**
  `domain/places/addresses/tests/journeys/address-crud.test.ts` names itself
  their replacement in its own header (ruling 55, Playwright is going), and both
  drove the retired URLs. The `@maps` spec survives, repointed at the combobox
  and with a note that the billed call is the server's now.
- **The `recipient_name` a snapshot should freeze.** An order's address snapshot
  is a `places.addresses` copy with no link, so it carries no recipient. Nothing
  reads one today (`order.user.name` is the FedEx contact), but if a packing
  slip ever needs "who signs for it" as of order time, that is a column on the
  snapshot and a line in `snapshot.sql` — not a change to this decision.
