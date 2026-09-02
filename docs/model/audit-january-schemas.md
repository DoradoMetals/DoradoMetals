# Audit — the eighteen schemas as they stand in dev (2026-09-02)

The name "January schemas" is shorthand for the namespaced schemas; many
tables changed after January, through migration 107. This report describes
the dev database as it is today.

**Date** 2026-09-02 · **Database** `dev` (`DATABASE_URL`) · **Method** read-only
queries against `information_schema` and `pg_catalog`, plus `SELECT DISTINCT`
and `count(*)` on small tables. No write, no migration, no `exchange` access
beyond reading two foreign-key definitions that point at it.

**Coverage: 51 base tables and 4 views across 17 schemas.** Above the 40-table
floor, so the audit is complete for the schemas that exist.

Schemas examined: `auth`, `checkout`, `fulfillments`, `leads`, `media`,
`metals`, `orders`, `organizations`, `payments`, `places`, `products`, `rates`,
`refiners`, `reviews`, `shipping`, `spots`, `tax`.

**Not examined, and why:**

| Object | Reason |
| --- | --- |
| `auctions` schema | Does not exist in dev. Dropped by `api/migrations/067_retire_auctions_from_the_new_schema.sql` (Jacob, 2026-08-23: "Auctions are going away"). `schemas.md` already says "not designed; not counted". |
| `exchange.*` | Out of scope by instruction and by covenant. |
| `public`, `pg_*`, `information_schema` | Out of scope. |

**Audits already covering ground this report does not repeat.** Cited where
relevant instead of re-derived: `audit:indexes` (source index survival),
`audit:query-paths` (query-side index leads), `audit:constraints`,
`audit:nullability` (production null rates), `audit:precision` (type-narrowing
loss), `audit:enum-domains` (text compared against an enum),
`audit:plaintext-secrets`, `audit:silent-mutations`, `audit:coverage`.

---

## Summary

| Schema | Table | Rows | Verdict | Reason |
| --- | --- | ---: | --- | --- |
| auth | account | 13 | keep as-is | better-auth owned, pinned at 1.6.9. |
| auth | employees | 2 | fix in place | 1:1 with `auth.users`; `role` duplicated on both. |
| auth | sessions | 198 | keep as-is | better-auth owned. |
| auth | users | 13 | keep as-is | Cut over 2026-09-01; leave alone per `schemas.md`. |
| auth | verification | 4 | keep as-is | better-auth owned. |
| checkout | checkouts | 6 | fix in place | Carries 10 nullable detail ids; `pickup_date`/`pickup_time` are text. |
| checkout | items | 4 | dissolves | Per `docs/model/lots.md` → `items.items` + `checkout.lines`. |
| fulfillments | directs | 0 | keep as-is | Clean; check constraint and unique both present. |
| fulfillments | fulfillments | 41 | keep as-is | Clean; `UNIQUE (order_id)`, cascade correct. |
| fulfillments | methods | 11 | keep as-is | Reference data; partial unique on default is right. |
| fulfillments | pickups | 0 | keep as-is | Clean. |
| fulfillments | shipments | 41 | keep as-is | Pure link table, correctly keyed. |
| leads | leads | 41 | fix in place | Three booleans encode one state machine; `contact` is a name in text. |
| media | emails | 1 | fix in place | `user_id` still points at `exchange.users`. |
| media | images | 1 | keep as-is | Clean; index gap already fixed per `audit:indexes`. |
| media | pdfs | 0 | fix in place | `order_id` FK has no `ON DELETE`; blocks the future purge. |
| metals | metals | 4 | fix in place | `name` has no `UNIQUE`, yet products resolve metals by name. |
| orders | addresses | 51 | fix in place | Deliberate snapshot, but `order_id` has no foreign key. |
| orders | items | 72 | dissolves | Per `docs/model/lots.md`. |
| orders | orders | 62 | redesign | No `refiner_id`; four boolean flags; `status` is unconstrained text. |
| orders | spots | 241 | keep as-is | Deliberate freeze per `docs/model/orders.md`. |
| orders | transactions | 62 | dissolves | Per `docs/model/orders.md`. |
| organizations | organizations | 16 | fix in place | `image_id` is the only image column with no FK. |
| payments | attempts | 43 | fix in place | A money row with no `created_at` at all. |
| payments | details | 40 | redesign | Bank, card and email details in one row; plaintext beside encrypted. |
| payments | intents | 43 | fix in place | `user_id` and `session_id` have no foreign keys. |
| payments | ledger | 19 | fix in place | `user_id` has no foreign key. |
| payments | methods | 10 | fix in place | Two `text[]` marketing columns; one is empty everywhere. |
| payments | settlements | 1 | fix in place | No `created_at`; `settled_at` is nullable. |
| payments | stripe_charges | 45 | keep as-is | Provider import staging; document it as such. |
| places | addresses | 64 | keep as-is | Clean. |
| places | location_hours | 18 | keep as-is | Clean; both check constraints present. |
| places | locations | 3 | fix in place | `type` is enum-like text; no audit columns. |
| places | user_addresses | 23 | keep as-is | Clean; partial unique on default is right. |
| products | bullion | 62 | redesign | `content` equals `gross` in 56 of 62 rows; `stock` and `quantity` overlap. |
| products | mints | 10 | fix in place | `UNIQUE (organization_id)` makes it a 1:1 extension table. |
| rates | rates | 16 | keep as-is | Clean; `unit` spelling differs from the item tables. |
| refiners | items | 72 | dissolves | Per `docs/model/lots.md`. |
| refiners | orders | 62 | dissolves | Per `docs/model/orders.md`. |
| refiners | refiners | 2 | fix in place | Three columns; shrinks to counterparties + `pool_entries` per `docs/model/refining.md`. |
| refiners | spots | 245 | dissolves | Per `docs/model/orders.md`. |
| reviews | reviews | 14 | fix in place | `name` is a live copy of `auth.users.name`; `rating` has no range check. |
| shipping | carriers | 3 | fix in place | Three columns; is really `logo` on `organizations`. |
| shipping | packages | 12 | fix in place | `length`/`width`/`height` are text holding numbers. |
| shipping | pickups | 7 | keep as-is | Clean; status check constraint present. |
| shipping | services | 11 | fix in place | `provider_code` and `max_declared_value` are dead columns. |
| shipping | shipments | 41 | fix in place | `cost`/`actual_cost` duplicated on `orders.transactions`; no `updated_at`. |
| shipping | tracking | 81 | keep as-is | Clean append-only event table. |
| spots | spots | 4 | fix in place | Stores derived deltas with no history to derive them from. |
| tax | sales_tax | 51 | redesign | `amount_owed` is an accumulator with no per-accrual rows. |
| tax | sales_tax_rules | 88 | fix in place | Seven min/max column pairs; `state_code` has no FK to `sales_tax.state`. |

Views (`metals.exchange_compat`, `products.mints_exchange_compat`,
`refiners.exchange_compat`, `shipping.carriers_exchange_compat`) are covered in
the cross-cutting section.

---

## Cross-cutting findings

### [keys] Two foreign keys still point at `exchange.users`

`media.emails.user_id` and `payments.details.user_id` reference
`exchange.users(id)`. `auth` is the identity owner since the 2026-09-01 cutover;
`exchange.users` is now a mirrored copy. Fix: repoint both at `auth.users(id)`.
This is a code-and-schema fix, not a data change — the covenant is untouched.

### [audit-cols] No table maintains `updated_at` by trigger

Only two triggers exist in the seventeen schemas, and both are the auth mirrors.
Every `updated_at` is set by hand in a `.sql` file: 43 files contain an `UPDATE`
and 25 of them do not mention `updated_at`. Most of those 25 target tables that
have no `updated_at` column, so the live gap is small — but nothing enforces it.
Fix: one `set_updated_at()` trigger function applied to every table that has the
column, or drop the column from tables nobody updates.

### [audit-cols] The audit-column set is applied at three different levels

| Level | Tables |
| --- | --- |
| `created_at` + `updated_at` + `created_by`/`_id` + `updated_by`/`_id` | 11 (orders.orders, orders.transactions, payments.details/intents/methods, products.bullion, rates.rates, reviews.reviews, shipping.services, organizations, fulfillments.fulfillments/methods, leads.leads) |
| `created_at` + `updated_at` only | 8 (orders.spots, payments.ledger, places.addresses, products.mints, refiners.orders, refiners.spots, auth.employees, shipping.packages) |
| `created_at` only | 4 (media.images, media.pdfs, payments.stripe_charges, shipping.shipments) |
| Neither | 20, including `payments.attempts`, `payments.settlements`, `orders.items`, `orders.addresses`, `refiners.items`, all four `places` children, all `fulfillments` children |

`payments.attempts` and `payments.settlements` are the ones that matter: they
record money events and carry no creation time at all. Fix: add
`created_at timestamptz NOT NULL DEFAULT now()` to both.

### [types] `created_by text` beside `created_by_id uuid`

Eleven tables carry both. The text half holds a display name and is written
independently of the uuid half. Fix: drop the text columns once the reads that
project them are converted, and resolve the name through `auth.users` on read.
`shipping.packages` is the odd one: its `created_by`/`updated_by` are **uuid**,
not text, and have no foreign key — rename to `_id` and add the FK, or drop.

### [naming] Casing of enum-like text values is inconsistent across schemas

| Convention | Columns |
| --- | --- |
| Title Case | `orders.orders.status`, `payments.ledger.type`, `products.bullion.type`, `shipping.shipments.shipping_status`, `shipping.tracking.status`, `leads.leads.priority` |
| UPPERCASE | `fulfillments.fulfillments.status`, `fulfillments.methods.type`, `payments.methods.type`, `organizations.organizations.type`, `places.locations.type` |
| lowercase | `payments.intents.status`, `payments.attempts.status`, `shipping.pickups.status`, `orders.orders.direction`, `payments.details.account_type` |
| Mixed inside one column | `payments.stripe_charges.status` holds `Paid`, `Refunded`, `requires_confirmation`, `requires_payment_method` |

Fix: pick lowercase snake for every stored status and type, and let the wire
layer present. `payments.stripe_charges` is the exception — it is a provider
import and should hold Stripe's spelling verbatim.

### [naming] `unit` is spelled two ways for the same concept

`rates.rates.unit` is `troy_oz`; `orders.items.unit`, `refiners.items.unit` and
`checkout.items.unit` are `t oz`, `g`, `lb`. A join or a lookup keyed on unit
would silently miss. Fix: one vocabulary, declared once, when `items.items`
lands.

### [normalization] Images are modelled three ways

`organizations`, `products.mints`, `payments.methods`, `places.locations` and
`shipping.packages` carry `image_id uuid` → `media.images`.
`refiners.refiners.logo` and `shipping.carriers.logo` are text paths.
`products.bullion.image_front` / `image_back` are text paths, populated on all
62 rows. Fix: one route. If `media.images` is the store, the three text columns
become `image_id`s; if paths are fine, `media.images` is doing less than it
looks.

### [normalization] Four `*_exchange_compat` views survive the Great Purge

`metals.exchange_compat`, `products.mints_exchange_compat`,
`refiners.exchange_compat`, `shipping.carriers_exchange_compat`. Named for the
legacy wire, but they are load-bearing: `features/products/repo.ts` and
`compose.ts` join `refiners.exchange_compat` on every product read. They are
denormalization shims over the `organizations` split, not legacy code. Fix:
rename them for what they do (`refiners.with_organization`) so no session
deletes them as purge residue.

### [keys] Foreign keys with no index on the referencing column

37 in total. 26 are `created_by_id`/`updated_by_id` — audit columns nobody
joins on; leave them. The remaining 11 break down as:

| Column | Note |
| --- | --- |
| `products.bullion.supplier_id` | Joined on every product read through the compat view. Add the index. |
| `media.emails.pdf_id` | Low traffic; accept. |
| `checkout.checkouts` × 9 detail ids | Checkout is disposable and six rows deep; accept. |

Not a repeat of `audit:indexes` or `audit:query-paths`: both ask whether a
*lookup* has an index. This asks whether the FK's own referential check does.

### [keys] `ON DELETE` is absent on 97 of 116 foreign keys

Absent means `NO ACTION`, so the referenced row cannot be deleted. Two places
where that is the wrong answer:

- **Checkout is disposable.** `checkout.checkouts` has nine `NO ACTION` keys to
  `places.addresses`, `payments.methods`, `payments.details`,
  `shipping.services`, `shipping.packages`, `fulfillments.methods`,
  `places.locations`. A stale cart therefore blocks a customer from deleting a
  saved address or payout detail. Fix: `ON DELETE SET NULL` on all nine.
- **The cancelled-order purge is future work.** `media.emails.order_id`,
  `media.pdfs.order_id`, `payments.intents.order_id`, `orders.items.order_id`,
  `orders.spots.order_id`, `refiners.orders.order_id`, `refiners.spots.order_id`
  and `reviews.reviews.order_id` are all `NO ACTION`. The six-table cascade
  CLAUDE.md describes will have to delete in dependency order by hand. Fix:
  decide the cascade shape when the purge is written, not before —
  `ON DELETE CASCADE` on an irreplaceable order table is itself a hazard.

---

## `orders`

**[keys] `orders.addresses.order_id` has no foreign key.** It has an index and a
`UNIQUE (order_id)` index, but no FK to `orders.orders(id)`. An order snapshot
can outlive its order with nothing to say so. Fix: add the FK.
`source_address_id` also has none — it points at `places.addresses` and is
non-null on all 51 rows; add it with `ON DELETE SET NULL` so the address book
stays deletable.

**[normalization] `orders.orders` has no counterparty column.** Per
`docs/model/orders.md`: add `refiner_id uuid` and
`CHECK (num_nonnulls(user_id, refiner_id) = 1)`; `user_id` is nullable today,
which is what makes the check expressible.

**[types] Four boolean flags encode order progress.** `review_created`,
`order_sent`, `tracking_updated`, `spots_locked`. Three of the four are NULL on
47 of 62 rows, so "false" and "never set" are not distinguishable.
`review_created` is true on 5 orders that have no `reviews.reviews` row, so it
means "review requested", not "review exists" — the name lies. Fix: each is a
timestamp of the event (`review_requested_at`, `sent_to_supplier_at`,
`spots_locked_at`) or it is derived; none should be a nullable boolean.

**[types] `orders.orders.status` is unconstrained text with no default.** Seven
values in dev: `Cancelled`, `Completed`, `In Transit`, `Payment Processing`,
`Pending`, `Preparing`, `Received`. Under D211 status is flair and drives no
logic, which is an argument for leaving it text — but nothing stops a typo
becoming a permanent state. Fix: a lookup table, or a check constraint; see
Decisions.

**[normalization] `orders.items.content` and `.price` are derived.** Dissolves
per `docs/model/pricing.md`. Confirmed: `content` is not `post_melt × purity` on
46 of 72 rows because a unit factor is folded in, exactly as `pricing.md`
describes; `price` is NULL on 30 of 72.

**[types] `orders.items.purity` carries `CHECK (purity >= 0 AND purity <= 1)`
and unconstrained scale.** The widening from `numeric(4,3)` landed (D200). Keep
the check on `items.measurements.purity`; dev already holds `0.9999` and
`0.9995`.

**[normalization] `orders.transactions` dissolves** per `docs/model/orders.md`.
Two facts worth carrying into that work: it duplicates
`refiners.orders.pool_oz_deducted` exactly (0 of 62 rows differ), and
`used_funds` disagrees with `funds > 0` on 3 of 62 rows, so the boolean is not a
reliable derivation of the amount.

**[keys] `orders.transactions.order_id` has no FK** and the table dissolves
anyway — noted so the replacement gets one.

## `checkout`

**[normalization] `checkout.items` dissolves** per `docs/model/lots.md`.

**[types] `checkout.checkouts.pickup_date` and `.pickup_time` are text** beside
`appointment_time timestamptz`. Zero rows populated in dev. Fix: one
`timestamptz`, or delete them.

**[types] `checkout.checkouts.direction` is text while `orders.orders.direction`
is the `orders.direction` enum.** Deliberate at the time — migration 068 says
so — but the two columns are compared value-by-value when a checkout becomes an
order, which is the exact coupling `audit:enum-domains` was written for. Fix:
promote to the enum when checkout is rebuilt on `checkout.lines`.

**[keys] Nine `NO ACTION` foreign keys on a disposable table.** See the
cross-cutting `ON DELETE` finding.

## `payments`

**[normalization] `payments.details` is three record types in one table.** Bank
payout (`routing_number`, `account_number`, `account_holder`, `bank_name`,
`account_type`), card (`card_brand`, `last_four`, `provider`, `provider_ref`)
and eCheck (`email_to`). Twenty-three columns, most NULL for any given row. Fix:
either accept it as a deliberate single-table inheritance and document the
discriminator (`method_id`), or split. See Decisions.

**[types] Plaintext and encrypted bank columns coexist.** `routing_number`,
`account_number` beside `routing_number_encrypted`, `account_number_encrypted`,
`encryption_key_id`, `routing_last_four`. Dev holds zero of either. This is the
known open thread, measured by `audit:plaintext-secrets` — not re-derived here.
`last_four` and `routing_last_four` are derivable from the plaintext today and
will be the only readable part after encryption, so they are a deliberate keep.

**[audit-cols] `payments.attempts` and `payments.settlements` have no
`created_at`.** An attempt's only ordering is its `provider_ref`. Fix: add
`created_at timestamptz NOT NULL DEFAULT now()` to both, and make
`settlements.settled_at` `NOT NULL` if a settlement without a time is
meaningless.

**[keys] `payments.intents.user_id` and `.session_id` have no foreign keys.**
Both uuid, both indexed (`idx_intents_session_user_type`). `user_id` should
reference `auth.users(id)`. `session_id` references `auth.sessions(id)`, which
better-auth deletes on logout — so the FK needs `ON DELETE SET NULL` or should
stay a bare uuid by design. See Decisions.

**[keys] `payments.ledger.user_id` has no foreign key** to `auth.users(id)`.
Nineteen rows of credit and debit against a user id nothing validates. Fix: add
it.

**[keys] `payments.stripe_charges` has no link to `payments.attempts`.** Its PK
is `payment_intent_id text`; `attempts.provider_ref` holds the same value and
has a `UNIQUE`. Only 4 of 45 charge rows match an attempt, which is consistent
with it being a raw Stripe export. Fix: leave unlinked, and add a header comment
saying it is provider staging, not a domain table — otherwise the next session
reads the 41 unmatched rows as a defect.

**[normalization] `payments.methods.details text[]` and `.fit_bullets text[]`
hold display copy.** `details` carries two-to-three paragraphs per method;
`fit_bullets` is `{}` on all 10 rows. Ordered, individually editable strings in
an array cannot be addressed or reordered without rewriting the column. Fix:
drop `fit_bullets`; move `details` to rows (`method_id`, `sort_order`, `body`)
or accept the array explicitly.

**[naming] `payments.methods` mixes fee vocabularies.** `flat_fee`,
`surcharge_percent`, `surcharge_label`, and `orders.transactions.surcharge`,
`payout_fee`, `refiner_fee`. Fix: one word for a charge the business levies.

## `refiners`

**[normalization] `refiners.items`, `refiners.orders` and `refiners.spots`
dissolve** per `docs/model/lots.md` and `docs/model/orders.md`.

Measured, in support of that design: `refiners.spots` duplicates `orders.spots`
value-for-value on 115 of its 245 rows for the same `(order_id, metal_id)`, and
`refiners.items` differs from its `orders.items` row on weights in 57 of 72
cases — which is the assay, and is exactly the fact
`items.measurements(stage='assayed')` exists to hold.

**[normalization] `refiners.refiners` is three columns.** `id`,
`organization_id` (`UNIQUE`), `logo`. It is a 1:1 extension of
`organizations.organizations WHERE type = 'REFINER'` carrying one attribute.
`docs/model/refining.md` keeps the table as the counterparty and adds
`pool_entries`, so it earns its place going forward — but the `logo` column
belongs with the other images.

**[keys] `refiners.spots(order_id, metal_id)` has no `UNIQUE`** while
`orders.spots` does. Zero duplicates in dev. Dissolves; noted only so the
replacement keeps the constraint.

## `products`

**[normalization] `products.bullion.content` is not derived and is wrong.** It
equals `gross` on 56 of 62 rows, and equals `gross × purity` on 1. For
`1oz Gold American Buffalo`: `gross` 1, `purity` 0.9999, `content` 1 — the fine
content is stored as the gross weight. Under `docs/model/lots.md` the domain
mints a declared measurement from the product's weight and purity at
add-to-checkout, so this column becomes an input to that mint and its value has
to be right. Fix: recompute or drop `content` and derive it.

**[normalization] `stock` and `quantity` are both `numeric NOT NULL` on
`products.bullion`** and differ on 2 of 62 rows. Two columns, one concept, no
stated difference. Fix: name what each means or collapse to one.

**[types] `products.bullion.type` is text (`Bar`, `Coin`, `Collectible`) and is
compared against the `tax.sales_tax_product_type` enum.** Already found and
owned by `audit:enum-domains` (D39, two production rows carrying `E'\n\tBar'`).
Not re-derived; cited so the model work does not reintroduce the coupling.

**[types] `image_front` and `image_back` are `text NOT NULL`** holding
filesystem paths, populated on all 62 rows, while `media.images` exists. See the
cross-cutting images finding.

**[normalization] `products.mints` has `UNIQUE (organization_id)`.** It is a 1:1
extension of `organizations WHERE type = 'MINT'` adding `type`
(`Private`/`Sovereign`) and `country`. Its own `mints_type_check` overlaps
`organizations.type` conceptually. Fix: fold `type` and `country` into
`organizations`, or accept the extension and say why.

**[naming] `products.bullion.supplier_id` references `refiners.refiners`.** Two
names for one relationship. Fix: `refiner_id`.

## `shipping`

**[types] `shipping.packages.length`, `.width`, `.height` are `text`.** All 12
rows cast cleanly to numeric (`9.0`, `14.0`). A dimension in text cannot be
compared against `shipping.services.max_length_in`, which is numeric. Fix:
`ALTER … TYPE numeric USING length::numeric` — non-destructive, all rows valid.

**[normalization] `shipping.shipments.cost` and `.actual_cost` are copied to
`orders.transactions.shipping` and `.shipping_fee_actual`,** and they disagree
on 32 of 62 orders. `docs/model/orders.md` puts the shipping charge on the
shipment. Fix: per `docs/model/orders.md`; the shipment is the owner.

**[keys] `shipping.shipments` has no link to an order.** The path is
`orders.orders` → `fulfillments.fulfillments` → `fulfillments.shipments` →
`shipping.shipments`. That is correct layering, not a defect — recorded so it is
not "fixed" by adding an `order_id`.

**[types] Dead columns on `shipping.services`.** `provider_code` is empty on all
11 rows; `max_declared_value` is non-null on 1 row (value `0`) while
`max_insured_value` is `10000` on all 11 — two columns for one ceiling. `price`
is set on 3 rows and NULL on 8. Fix: drop `provider_code` and
`max_declared_value` after checking production; document what `price` means on a
carrier service.

**[audit-cols] `shipping.shipments` has `created_at` and no `updated_at`,**
though `features/shipping/shipments/sql/update.sql` updates it. Fix: add the
column or accept that shipment mutation is not timestamped.

**[naming] `supports_pickups`, `supports_dropoffs`, `supports_returns`,
`supports_insurance`** are the deliberate legacy wire spellings CLAUDE.md names.
Not flagged.

## `tax`

**[normalization] `tax.sales_tax.amount_owed` is a running accumulator with no
ledger behind it.** 51 state rows, `numeric(16,2)`, incremented by
`features/sales-tax/sql/accrue.sql`. There is no per-accrual row, so the balance
cannot be recomputed, audited or attributed to an order.
`audit:silent-mutations` already reports this statement as the one
"unobservable" call and calls it correct by design — that is right for the
*statement*; the *model* is still a balance with no journal. Fix: accrue rows
(`state`, `order_id`, `amount`, `accrued_at`) and make `amount_owed` a view.

**[naming] `tax.sales_tax.state` and `tax.sales_tax_rules.state_code` are both
`character(2)`** for the same concept, with no foreign key between them. Fix:
one name, and a FK from rules to the state row.

**[types] `char(2)` pads.** `character(2)` is blank-padded and compares
differently from `text` in some contexts. Fix: `text` with a length check, or
leave — low risk at two characters.

**[normalization] `tax.sales_tax_rules` is a rule engine in 17 columns.** Seven
min/max pairs (`min_price`/`max_price`, `purity_min`/`purity_max`,
`aggregate_min`/`aggregate_max`, `markup_min_pct`/`markup_max_pct`,
`weight_min`/`weight_max`) with sentinel defaults of `1000000000000`. Fix:
`numrange` columns with GiST exclusion, which also makes overlapping rules
impossible to insert. Judgment call; see Decisions.

**[nullability] `is_domestic` and `is_legal_tender` are the only nullable
columns on `sales_tax_rules`,** and NULL there means "does not matter" while
`false` means "must be false". A three-valued flag. Fix: document it, or use a
`matches_any` sentinel.

## `places`

**[types] `places.locations.type` is enum-like text** (`DORADO_OFFICE`,
`FEDEX_OFFICE`, `REFINER_OFFICE`) with no constraint. Fix: check constraint or
enum.

**[audit-cols] `places.locations`, `places.user_addresses` and
`places.location_hours` have no `created_at`.** `places.addresses` has both.
Fix: add `created_at` to the three, or drop it from the one — pick a rule.

**[naming] `places.locations.label_company_name` and `.label_phone_number`** are
carrier-label overrides; the `label_` prefix reads as "display label". Fix:
`ship_from_company_name` / `ship_from_phone_number`.

## `organizations`

**[keys] `organizations.image_id` is the only `image_id` column with no foreign
key** to `media.images`. Fix: add it.

**[normalization] `organizations` is the polymorphic parent of `refiners`,
`shipping.carriers` and `products.mints`,** discriminated by `type`
(`CARRIER`, `DORADO`, `MINT`, `REFINER`), each child holding one or two extra
columns and a `UNIQUE (organization_id)`. `shipping.carriers` is
`(id, organization_id, logo)` — a single attribute in its own table. Fix: see
Decisions.

**[keys] Four overlapping unique indexes.** `organizations_type_name_uniq`
`(type, name)` and `organizations_carrier_uniq` `(type, name, email)` — the
second is implied by the first and can go.

## `metals`, `spots`, `rates`

**[keys] `metals.metals.name` has no `UNIQUE`,** yet products and quotes resolve
metals by name and `spots.spots` has `UNIQUE (metal_id)`. Four rows, no
duplicates. Fix: add `UNIQUE (name)`.

**[normalization] `spots.spots` stores `percent_change` and `dollar_change`,**
which are deltas against a previous price the table does not keep. One row per
metal, overwritten in place. Fix: accept them as a provider-supplied freeze
(Jacob, 2026-09-02: a history table is out of scope).

**[audit-cols] `spots.spots` has `updated_at` and no `created_at`.** The only
table in the seventeen shaped that way.

**[naming] `rates.rates.scrap_pct` / `bullion_pct` vs
`orders.spots.scrap_percentage` / `bullion_percentage`.** Same concept, two
spellings. Fix: one.

## `media`

**[keys] `media.emails.user_id` references `exchange.users`.** See cross-cutting.

**[keys] `media.pdfs.order_id` and `media.emails.order_id` have no `ON DELETE`.**
See cross-cutting.

**[audit-cols] `media.emails` has `sent_at` and no `created_at`.** Correct for an
event log; recorded so it is not "fixed".

**[normalization] `media.images.metadata jsonb` defaults to `{}` and is `{}` on
the one dev row.** Empty escape hatch. Fix: leave, or drop until something needs
it.

## `leads`

**[types] `contacted`, `responded`, `converted` are three booleans over one
lifecycle,** beside `last_contacted timestamptz`. `converted = true` with
`contacted = false` is representable and meaningless. Fix: one `status` column,
or three timestamps.

**[types] `contact text NOT NULL DEFAULT 'Jacob Johnson'`** names the owning
salesperson as a free-text string; every row holds that one value. Fix:
`owner_id uuid` → `auth.users(id)`.

**[types] `priority text NOT NULL DEFAULT 'Medium'`,** one distinct value in
dev, no constraint. Fix: check constraint.

## `reviews`

**[normalization] `reviews.reviews.name` is a live copy of `auth.users.name`** —
0 of 14 rows differ. `docs/model/README.md` names the two deliberate snapshots
(`orders.spots`, `orders.addresses`); this is not one of them. Fix: drop and
join, unless a review is meant to keep the name as written at the time — in
which case say so in the column comment.

**[types] `rating numeric` has no check.** Values 1, 3, 4, 5 in dev; nothing
prevents 7 or 4.5. Fix: `CHECK (rating BETWEEN 1 AND 5)` and `smallint`.

**[keys] Both `order_id` and `user_id` foreign keys are `NOT VALID`.** They were
added without validating existing rows and never validated since. Fix:
`ALTER TABLE … VALIDATE CONSTRAINT` — read-only against the data, and it either
passes or names the bad rows. Same for `products.bullion.metal_id`,
`products.bullion.mint_id` and `rates.rates.metal_id`.

## `auth`

`schemas.md`: *"unchanged, cut over, pinned — leave alone"*. Two observations,
neither a fix:

**[types] All 13 `auth` timestamps are `timestamp without time zone`** while
every other schema uses `timestamptz`. This is better-auth's own convention and
the pin at 1.6.9 means it does not move.

**[normalization] `auth.employees` is 1:1 with `auth.users`** (`UNIQUE
(user_id)`, 2 rows) and its `role` column holds `admin` for both — the same
value `auth.users.role` holds. Fix: drop `employees.role` and read
`users.role`, or state that an employee role and an account role are different
things.

## `fulfillments`

No findings. Every child has a `UNIQUE (fulfillment_id)`, `ON DELETE CASCADE` to
the parent, `ON DELETE SET NULL` to the employee, and time-order check
constraints on both scheduled types. `fulfillments.shipments` is a clean link
table with `ON DELETE RESTRICT` to `shipping.shipments` — correct, a shipment
with a label bought must not vanish because a fulfillment was deleted.

---

## Decisions Jacob has to make

Only where two defensible designs exist. Everything above this line has one
right answer.

1. **`products` → `catalog`, or keep the name.** `schemas.md` already says
   "keep `products` if the rename buys nothing". The rename costs every import
   path in `features/products`; it buys grouping `metals` under the same schema.

2. **`orders.orders.status`: enum, lookup table, or unconstrained text.** D211
   says status is flair and drives no logic, which argues for text. Against: a
   typo becomes a permanent state and the admin dropdown offers it, which is
   exactly what `audit:enum-domains` found for `products.bullion.type`. A
   lookup table also gives sort order and display label a home.

3. **`shipping.carriers` and `refiners.refiners`: keep the 1:1 child tables, or
   fold into `organizations`.** Both are `(id, organization_id, logo)`. Folding
   removes two tables and two joins; keeping them gives each counterparty type
   a place to grow — and `docs/model/refining.md` grows `refiners` immediately
   with `pool_entries`, which argues for keeping at least that one. Same
   question for `products.mints` (`type`, `country`).

4. **`payments.details`: single-table inheritance or three tables.** Twenty-three
   columns covering bank, card and eCheck. Splitting is cleaner and breaks every
   read; keeping it is honest if the discriminator (`method_id`) is documented
   and the wire never sees the NULLs.

5. **`payments.intents.session_id`: foreign key or bare uuid.** better-auth
   deletes `auth.sessions` rows on logout. A FK needs `ON DELETE SET NULL` and
   then the reconciliation metadata D25 relies on is lost at logout. A bare
   uuid keeps the audit trail and validates nothing.

6. **`tax.sales_tax_rules`: min/max column pairs or `numrange` with a GiST
   exclusion constraint.** Ranges make overlapping rules unrepresentable, which
   is a real class of tax bug. They also change every rule query and the
   contracts derived from them.

7. **DECIDED (Jacob, 2026-09-02): `spots.spots` keeps `percent_change`/
   `dollar_change` as provider freezes.** A table recording every poll is out
   of scope; the analytics in `docs/model/pricing.md` use frozen
   `orders.spots` and pool locks instead.

8. **`reviews.reviews.name`: drop and join, or keep as a name-at-time-of-review
   freeze.** Zero rows differ today, so either is defensible.

9. **The four `*_exchange_compat` views: rename or leave.** They are live
   denormalization shims, not purge residue, and the name says the opposite.

10. **Whether `rates` folds into `pricing`.** `schemas.md` raises it and does not
    decide.
