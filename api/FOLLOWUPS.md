
### Ruling 72 — ids are the database's (2026-09-04)

Jacob, verbatim: "The database will create ids. WE SHOULD NEVER CREATE UUIDS ON
THE API OR FRONTEND."

**The measurement that opened this had a hole, and finding it mattered more
than the count.** "4 of 49 native uuid id columns have no default" was true of
the literal query (column named `id`, no `column_default`, outside
exchange/auth) but all four - `metals.exchange_compat`,
`products.mints_exchange_compat`, `refiners.exchange_compat`,
`shipping.carriers_exchange_compat` - are VIEWS, not tables: read-only
reassembly projections 017/021/022/027 built so verify:parity has something
to compare exchange's old shape against. Nothing writes through any of the
four (grep confirms the only readers are verify:parity, verify:backfill and
compare-tables.mjs). Re-run relkind-aware, every uuid PRIMARY KEY on a real
table (relkind 'r') outside exchange/auth - 45 of them - already defaults
`gen_random_uuid()`. Zero gaps. Migration 129 does not ALTER the four views
(ceremony that would do nothing, since none is auto-updatable); it adds a
permanent DO-block guard that re-runs the same relkind-aware check and refuses
to apply if a future table ever ships a uuid primary key with no default.

**Every `randomUUID()` call site outside tests is gone** - 20 files, matching
the measured count, across fulfillments/shipments/pickups/directs (both the
fulfillments-owned and shipping-owned tables), places/addresses +
user-addresses, payments/details, payments/webhook, media/images, media/pdfs,
shipping/carriers + services + pickups + parcel, orders/items + transactions +
addresses, refiners/spots, the ledger (`db/transactions/repo.ts`), and
`shared/logging/http.ts`'s request-id generator (replaced with the
`x-request-id` header falling back to a local counter - not a database id at
all, so it did not belong in this sweep by content, only by literal grep).
`domain/media/images/service.ts`'s OTHER randomUUID() - the upload filename's
uniquifying token, chosen before any row exists so it cannot come from
RETURNING - became `randomBytes(16).toString("hex")`: not a UUID, satisfies
the ruling and the gate, and was never the row's own id anyway.
`domain/media/pdfs/store.ts` similarly stopped minting an id for the storage
path's uniquifier and uses the PDF's own sha256 checksum instead, which it was
already computing.

**A second, quieter pattern turned up entirely from reading, not grepping**:
`COALESCE($1, gen_random_uuid())` with an optional `id` the repo accepted and
no production caller ever supplied - `orders.createForCheckout`,
`payments.intents`, `leads`, `reviews`, `rates`. All dead flexibility; removed
along with the params and the tests/builders that exercised the override.
**One of these was live, not dead**: `POST /products` parsed its body against
`BullionPatch`, which (unlike `BullionPatchColumns`) still carried `id` -
`updateProduct`'s controller already stripped it with `.omit({id:true})` but
`createProduct`'s did not, so an admin client could set a new product's own
id and the server would honor it. Both controller and service now take
`BullionPatchColumns`.

**One place keeps passing `id:` on purpose, and the new gate knows it by
name**: `payments.attempts` reuses its intent's already-assigned id as its own
primary key (`domain/payments/service.ts`'s `attempts.create({id: intent_id,
...})`) - a deliberate shared-key extension row, not a mint. Every other
caller still gets `payments.attempts.id`'s own `gen_random_uuid()` default.
`lint:no-minted-ids` ACCEPTs exactly this one call by
`file::namespace.method` key, same shape as `audit:silent-mutations`' ACCEPTED
map.

**The one restructuring the ruling anticipated - "the order row is inserted
FIRST... its returned id feeds the INSERT … SELECT copies" - was already
done**, and not by this wave: `domain/orders/place.ts`'s `writeOrder` already
calls `ordersRepo.createForCheckout` first and threads the returned `order.id`
into items/spots/totals, and `orders.items`' `create_bought.sql`/
`create_sold.sql` and `orders.spots`' `freeze.sql` already call
`gen_random_uuid()` directly in the SQL rather than accepting a parameter.
That is ruling 66, verified rather than redone.

**Builders now take the id from the returned row** instead of minting one to
pass in: places (address + its user-address link), orders (order items,
spots, the address-link raw INSERT), payments (details' AAD-bound id,
intents), refiners (the engagement's spot rows), shipping (the shipment,
its draft fulfillment, and the fulfillment-shipment link), transactions
(the ledger entry), leads, reviews, products. `payments.details` needed a
real restructure, not just a deletion: `aadFor(id, ...)` binds the encrypted
envelope to the row's own id, so both `saveCheckoutPayout` and the `aPayout`
builder now INSERT the base fields first, read back the DB-assigned id, seal
with that id, then UPDATE the encrypted columns onto the same row - one extra
statement on the create path, same transaction, no minted id anywhere.
`anId()` survived only as the well-formed-id-that-names-nothing helper for
negative tests and actor stubs (a stranger's id, a 404 fixture, an unknown
actor) - renamed `anUnknownId()` (13 files) so that is what it says on its
face. `shared/testing/builders/users.ts` still mints `auth.users.id` directly:
left alone deliberately, since `auth` was excluded from this ruling's own
measurement query and better-auth's identity model is not this wave's to
touch.

**Gate**: `lint:no-minted-ids` (`api/scripts/lint-no-minted-ids.ts`, self-
tested - 10 cases) fails on a bare `randomUUID()`/`crypto.randomUUID()`, a
`uuid` package import, or an `id:` key reaching an object passed to a repo
function named `create` or `create*` (resolved through the calling file's own
import, including the `#db` barrel - not by name, same lesson
`audit:silent-mutations` already paid for), anywhere under `api/**` outside
`shared/testing/` and any `tests/`/`.test.` file. Wired into `check.mjs`'s
`api-lint` group. `scripts/` itself is excluded from the walk: its own
self-test fixtures plant strings shaped like `id: "x"` repo calls to exercise
OTHER lints, and a naive scanner cannot tell planted fixture text from real
code without full tokenization - `audit:silent-mutations` and
`lint:no-column-arrays` made the same choice for the same reason.

**Contracts**: `LedgerEntryPatch`, `PaymentIntentPatch` and
`PaymentDetailsPatch` no longer carry `id` at all (`PaymentDetailsPatch`'s
`update()`-only `PATCHABLE` omit narrowed to just `user_id`, since `id` is no
longer in the type to omit). `BullionPatchColumns` (already existed for
`updateProduct`) is now `createProduct`'s type too, both controller and
service. `lint:type-homes`'s ACCEPTED ledger dropped its `db/leads/repo.ts`
and `db/reviews/repo.ts` entries - each held exactly the local
`{Lead,Review}Create = {Lead,Review}Patch & { id?: string | null }`
intersection this wave deleted, so the count the small-features lane's ledger
pinned (1 each) is now 0, and the ratchet only shrinks.

**Verify, all against dev then a fresh `test_ids-lane`**: `lint:migrations`
(135 files, no destructive writes to exchange) pass; `migrate` applied 129
clean both places; `dump:schema`, contracts `generate`+`build`,
`verify:genesis` (49 tables + 4 views, identical to dev, committed genesis
matches), `verify:fresh` (74 generated files, nothing regenerated) all pass;
`pnpm --filter @dorado/api typecheck` and the full `test` suite (221 files,
1312 passed, 1 pre-existing skip, 0 failed) pass; `pnpm --filter @dorado/client
typecheck` passes untouched (still types its product mutations against the
looser `BullionPatch`, which is unaffected - not this lane's wire pass);
`lint:no-minted-ids` and its self-test pass (0 findings, 1 accepted);
`pnpm check:fast` is green except `figma:inventory` (9 pre-existing findings,
Jacob's, unrelated to this wave).

8. FULL REWRITE (Jacob, the general rule of thumb): "I no longer care
   about ANY of the legacy code. I only care about the legacy table,
   which we have in place." The exchange TABLES and their data stay
   sacred - dual-writes continue so exchange stays a level shadow - but
   legacy READ paths, repo switches, and bothWays machinery are no longer
   a rollback story to preserve: the new code is the code. Legacy code
   survives only where it earns its keep as TEST infrastructure ("we can
   have some of our tests and logic be driven by legacy code, that's ok
   and appropriate"). CONSEQUENCE: the PO read pivot unblocks - the
   damaged-shipments divergence showed exchange as the damaged copy, and
   under full-rewrite the new schema's reads are the truth; the
   decomposition gate demotes from blocker to legacy-driven regression
   harness.
