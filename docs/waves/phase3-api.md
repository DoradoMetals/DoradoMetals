# Phase 3, API half — one home for every type

Owner: phase3-api lane (dispatched 2026-08-29).
One writer per file: whoever takes this lane owns this file and nothing else.

```
A0. Executor: 37 declarations become one   ██████████████████  100%
A1. API: 8 boundary-crossing types (was '118')  █████████████░░░░░   70%
A2. API: single-file types stop exporting    ██████████████░░░░   80%
A3. API: input/patch shapes into contracts   ███████░░░░░░░░░░░   40%
A4. lint: a type has exactly one home           ░░░░░░░░░░░░░░░░░░    0%
```

## The ruling

Jacob: *"if we have types randomly living in files, then we have failed"* and
*"we shouldn't have types — except for like, reasonable things i.e. a client
only onClick handler — living in feature code."*

## The numbers, all re-derived 2026-08-29

188 exported type/interface declarations in `api/features/`. **118 appear in
more than one file; 70 appear in exactly one.** For the API the test is
mechanical, which is why it can eventually lint: a type used in more than one
file crosses a boundary and belongs in the contracts; a type used in exactly one
file is an implementation detail and should not be exported. No third case.

**A3's count is 29, not the 31 this brief inherited** — 22 `*Input`, 6 `*Patch`,
1 `*Update`, and 12 of the 29 are cross-file. It is a LOWER BOUND: it matches on
name suffix, so a request body called `NewAddress` is invisible to it. Whoever
takes A3 should re-derive from the controllers rather than trusting a suffix.

## Start with A0 — it cannot break

`export type Executor = PoolClient | undefined;` is declared **35 times**, all
byte-identical, and referenced in 69 files (D178). One declaration in
`shared/db/`, 35 imports, 35 deletions, no behaviour change. Do it first: it
proves the mechanics end to end on something that cannot break, and it removes
35 items from A1's judgement list before any judgement is required.

## What NOT to sweep with it

**Twelve other names are declared more than once** — `Direction` (3), then
`Window`, `SpotRow`, `Quote`, `PriceableLine`, `PickupInput`, `OrderSpotRow`,
`OrderPrices`, `Lookups`, `ComposedAddress`, `Category` at 2 each. **These are
not D178.** Two types sharing a name may describe genuinely different things —
`Category` in products is not `Category` in sales-tax — and shared-name
confusion has already produced three false findings on this project
(`audit:frontend-nullability`'s `serviceSchema`/`code`). Diff the two
definitions before assuming they are one type.

## Moving a type and adopting it are ONE commit (D176)

47 of 128 existing contract exports are imported by nothing. Nine of those are
hand-written types somebody wrote and nobody adopted; six are checked by nothing
at all. A contract is validated by USE — an unimported one has never been
compared against the SQL, the caller, or the row, and has exactly the authority
of a comment while looking like a guarantee.

So a type parked in `@dorado/contracts` with its old definition still in use is
**strictly worse than leaving it alone**, because it looks migrated. Every move
lands with its adoption in the same diff.

## What not to lose in the move

Several types are deliberately wider than they look, and a contract that narrows
them asserts something about callers the compiler already disproved — the same
class of loss as the `?? 0` that D145 rejected.

- `ServiceInput` is all-optional-and-untrusted because it **is** `req.body`, and
  the `flag()` helper beside it distinguishes `false` (a value) from `undefined`
  (absent).
- `ShipmentUpdate` types every timestamp as `Date | string` because callers
  spread a row pg already parsed, and `shipping_label` as `string | Buffer`
  because FedEx returns a buffer.

## Gate

`pnpm check` from the REPO ROOT as a fresh compound, backgrounded, and read
`CHECK_EXIT` from the file — never from the task notification. Budget ninety
minutes: the dev database is remote at ~160–200 ms per round trip.

**Do not kill processes.** A subagent's pattern-based cleanup killed the
coordinator's gate runs twice and left a committed order in dev (D177). Report
orphans; the coordinator kills.


## What actually happened (lane pass, 2026-08-29)

### A0 — done, and it was 37 rather than 35

`shared/db/executor.ts` is the one home. Every declaration was byte-identical
AND every declaring file imported `PoolClient` from pg for that one line and
nothing else — checked, not assumed: all 37 used the identifier exactly twice.
So the transform was a swap, not an insertion: the pg import line BECAME the
executor import.

Two of the 37 are in `legacy/`, which is why the brief's count was 35. 25
import sites were repointed at `#shared/db/executor.ts`. One site was not an
import at all and is the reason a grep-only count would have been wrong:
`features/shipping/carriers/compose.ts` wrote `organizations.Executor`,
namespace-qualified through `import * as organizations`, and it was invisible
to every pattern that looks for `Executor` in an import list. `typecheck`
found it.

### A1 — the count is right and the CONCLUSION it invites is not

Re-derived by IMPORT rather than by word-frequency (a word scan counts a name
in a comment): **105 names, not 118.** The split that matters:

```
  88   cross FILES but never leave their own feature (repo -> service ->
       compose, plus that feature's tests)
  17   cross a feature boundary
   -   of which  9  cross only into legacy/<the same feature>
  82   exported and imported by nothing at all   (that is A2, and it is 82)
```

**So the boundary-crossing set is 8, not 118**, and the mechanical rule read
literally would have moved a `Map<string, MethodRow>` into the package the
frontend imports. Three of the 8 were pure aliases and are gone (below). Five
remain, each left on purpose, each recorded.

**THE CONTRACTS ARE NOT A DUMPING GROUND FOR API TYPES, and one measurement
settles it.** `wire/shipping.ts`'s `Carrier` types `organization.name` as
`string | null`; `organizations.organizations.name` is NOT NULL and the
generated `OrganizationsRow` says so. The contract was widened to admit the
*exchange* implementation, which the wire-axis retirement deleted. Adopting it
as the API's internal type would hand the compiler a null the server has
already disproved — D145's class, in the widening direction. The same holds
for `Refiner`, and for every wire shape whose timestamps are `z.string()`
while pg hands the server a `Date`. **Contracts parse the wire; feature types
are what the server knows. They are not one type.**

What that leaves as legitimately movable is the case where the feature type is
*already exactly* a contract type and the local name is the only difference.
Those are pure indirection, and moving them costs nothing:

- `features/refiners/compose.ts`, `features/shipping/carriers/compose.ts` —
  `OrganizationRow` was `organizations.OrganizationsRow`. Both now name the
  contract. Two features stop importing a third feature's types.
- `features/orders/compose.ts` — `RefinerItemRow` was `refiners.ItemsRow`.
  Same fix; orders stops importing refiners' types.

**Left, with the reason:**

- **Nine into `legacy/<same feature>/`** (`AddressValues`, `LeadRow`,
  `NewImage`, `NewLead`, `ProductValues`, `Quote`, `RateInput`,
  `ReviewInput`, `ScanEvent`, `ServiceValues`). The mirror takes the same
  input its feature does — that coupling IS the dual write. The directory is
  on death row; moving its types into the contracts would outlive it.
- **`PayoutRow` / `PayoutDetailsRow`** (payouts -> orders). `wire/payouts.ts`
  already has `Payout`, derived as `PayoutsRow.omit({routing_number,
  account_number})`. Adopting it would mean a THIRD sensitive column added to
  `exchange.payouts` is admitted automatically. The repo's hand-written list
  refuses by default. On the most sensitive table in the database that
  property is worth more than the deduplication. Recorded in a comment at the
  orders/compose.ts import so the next sweep does not "fix" it.
- **`ComposedItem` / `ComposedSalesItem` / `ComposedScrap`** (orders ->
  scrap, media). These are the composed order shape `wire/orders.ts` records
  as DEAD on the wire. They survive for the `exchange` mirror and the PDF and
  email renderers, which still want the joined tree. Moving a retired wire
  shape back into the contracts would be a regression.
- **`PaymentSession`** (payments -> orders). A better-auth session, not a
  wire shape and not a row.

### A2 — 56 exports removed

Un-exported where the name appears in NO other file anywhere in the repo
(api, frontend, packages, scripts) — deliberately conservative, because
`ServiceInput` and `Window` have unrelated same-name twins elsewhere and a
looser scan would have called them movable. `typecheck` then caught two the
scan still got wrong, both re-exported through a chain (`export … from`)
rather than imported: `orders/spots/repo.ts`'s `OrderSpotRow` and
`pricing/ask.ts`'s `OrderPrices`. Both restored.

**34 remain exported and unimported**, every one for a reason a lint will
have to know about: a test uses it, a re-export chain carries it, or the
frontend/contracts hold an unrelated type of the same name. Two of them —
`OrganizationRow`, `RefinerItemRow` — became unimported *because of A1 above*,
and are the warning for A4: **"exported iff imported" is unstable for a repo's
own row type.** A repo publishing its row type is the design; today's import
count is weather. A4 should exempt `repo.ts` row aliases or it will oscillate.

### Duplicate names — diffed, as instructed. Three of eleven are one type.

| name | verdict |
|---|---|
| `Category` ×**3** | **IDENTICAL.** All three are `fulfillments.MethodsRow["category"]` — `fulfillments/service.ts`, `fulfillments/methods/service.ts`, and a THIRD the brief did not have, already unexported, in `orders/intake.ts`. Not the products/sales-tax collision the brief expected; that pair does not exist in `features/`. |
| `Window` ×2 | **IDENTICAL**, byte for byte, in `fulfillments/pickups/repo.ts` and `fulfillments/directs/repo.ts`. |
| `Direction` ×3 | **2 identical, 1 unrelated.** The two fulfillments ones are `NonNullable<fulfillments.MethodsRow["direction"]>` (Inbound/Outbound/Return). `checkout/repo.next.ts`'s is `typeof SALE \| typeof PURCHASE`. The brief's warning was right about exactly one of the three. |
| `OrderSpotRow` ×2 | **DIFFERENT, and one is dead** — see the finding below. |
| `OrderPrices` ×2 | **DIFFERENT.** `pricing/ask.ts`'s is all-required computed output; `orders/write.service.ts`'s is all-optional-nullable input. |
| `ComposedAddress` ×2 | **DIFFERENT.** orders' is a flat snapshot with `address_id`/`is_residential`/`is_valid`; places' is `AddressRow & { user_address }`. |
| `Lookups` ×2 | **DIFFERENT.** A local name for "what this compose step needs to look up". Both intra-feature. |
| `PickupInput` ×2 | **DIFFERENT.** shipping's is the FedEx request body; fulfillments' is the pickup row's input. |
| `Quote` ×2 | **DIFFERENT ON PURPOSE.** `spots/repo.ts`'s is all-optional-nullable (what the provider hands back); `spots/service.ts`'s is all-required (the resolved quote). Same `ServiceInput` discipline the brief flags — do not merge. |
| `SpotRow` ×2 | **DIFFERENT.** orders' is a 5-column projection; spots' is `Omit<spots.SpotsRow,…> & { updated_at: Date }`. |
| `PriceableLine` ×2 | **ONE FAMILY.** `pricing/service.ts` imports `pricing/bid.ts`'s as `BidLine` and widens it with `bullion_id`. Deliberate layering. |

The identical three (`Category`, `Window`, `Direction`) are each a one-line
indexed access into a contract, all already local-only, and all now
unexported. They do NOT want a shared home the way `Executor` did: there is no
`Category` a second feature should reach for, only `MethodsRow["category"]`,
which is already the contract.

## Findings — for FOLLOWUPS, not for this file to own

1. **`ScrapPart.content` was typed `number`, required, and it is not.** FIXED
   in this pass. `features/media/pdfs/render/sections.ts`: every other field
   of that deliberately-loose interface is optional, and every source of
   `content` admits null (`ComposedScrap.content`, `orders.items.content`,
   `exchange.scrap.content`). It typechecked because the line builder reaches
   it through `item.scrap ?? ({} as ScrapPart)` — a cast over an empty object,
   which is how a *missing* field typed `number` got past tsc. Both templates
   already guard `scrap.content != null` before `.toFixed(3)`, and
   `getItemPrice` takes `number | null | undefined`, so the guards were right
   and the type was wrong. The hazard was live in one direction: tsc reports
   those guards as redundant against the old type, and deleting one puts
   `Cannot read properties of null` on a customer invoice. Now
   `content?: number | null`, and the cast is a plain `{}`.

2. **`getSalesMetalsForOrder` returns rows whose `sales_order_id` is always
   `undefined`.** `features/orders/service.ts:1137` casts
   `orderSpots.getFor()` — which projects `purchase_order_id` — to
   `SalesOrderMetalRow[]`, which declares `sales_order_id`, through
   `as unknown as`. Not currently reachable as a bug: both consumers
   (`patch.service.ts`'s supplier op, `media/pdfs/order-inputs.ts`) read only
   `name`/`ask`/`bid`. It is a type asserting a field that is never present.

3. **Dead read path in `features/refiners/spots/`.** `getFor`, `getMany`,
   their `sql/get_for.sql` and `sql/get_many.sql`, and the `OrderSpotRow` they
   return are called by nothing. They are the legacy-vocabulary projection
   (`purchase_order_id`, `type`, `ask_spot`, `bid_spot`) that fed the composed
   order wire retired on 2026-08-28 — the live read is `getForEngagement`.
   Reported, not deleted: deletion is the coordinator's call.

4. **A3's real shape: SIX PATCH bodies are declared twice — once in the API,
   once in the frontend — with no contract between them, and four have
   already drifted.** These are the request bodies of the D87 consolidation,
   the newest endpoints on the project, and they are precisely the ones no
   contract describes. A3 should start here rather than from a `*Input`
   suffix scan, which does not match a single one of these names.

   | body | API | frontend | drift |
   |---|---|---|---|
   | `OrderPatch` | `orders/patch.service.ts` | `features/orders/patch.ts` | `finalize_pricing` `boolean` vs `true`; `supplier.send` `boolean` vs `true` |
   | `OrderItemPatch` | `orders/items/service.ts` | `features/orders/items.ts` | `reset` `boolean` vs `true`; `scrap` `Record<string, unknown>` vs a typed `OrderItemScrapPatch` |
   | `ShipmentPatch` | `shipping/shipments/patch.service.ts` | `features/shipping/queries.ts` | **`shipping_charge`: API `number \| null`, frontend `number`** |
   | `RefinerOrderPatch` | `refiners/orders/service.ts` | `features/refiners/queries.ts` | **four fields nullable in the API and non-null in the frontend**: `pool_oz_deducted`, `pool_remediation`, `fee`, `refiner_id` |
   | `PayoutPatch` | `payouts/service.ts` | `features/payouts/queries.ts` | agree |
   | `RefinerItemPatch` | `refiners/items/service.ts` | `features/refiners/queries.ts` | agree |

   The `boolean` vs `true` cases are the frontend narrowing itself and are
   harmless. **The last two rows are the interesting ones and they point the
   same way**: the API accepts `null` to CLEAR five values (a shipment's
   charge, a refiner engagement's pool ounces, remediation, fee and refiner)
   and the frontend's own type makes sending that null a compile error. Either
   the clear is a capability nobody can reach, or the API is accepting a null
   it should refuse. A contract would have made that a decision instead of a
   discrepancy. `ServiceInput` doubles the same way and is on the brief's
   do-not-narrow list, so it wants the contract written FROM the API's
   version, never merged toward the frontend's.

5. **Generated contracts type every timestamp as `z.string()`; pg hands the
   server a `Date`.** `api/db.ts` registers parsers for NUMERIC and INT8 and
   none for timestamps, so `query<LeadRow>` where `LeadRow = leads.LeadsRow`
   is typed `created_at: string` and holds a `Date`. This is correct for the
   contract — it describes the wire, and `validate:wire` compares
   `JSON.parse(JSON.stringify(row))` — and wrong for every server-side read of
   the value. Nothing is broken that was looked at; it is the reason A1 cannot
   simply adopt wire contracts internally, and it is worth a decision of its
   own.

## A3 — the six PATCH bodies are done; fourteen `*Input` remain

Owned by the patch-surface lane, **2026-08-29**. Full record, including the
per-field null decision and four defects it turned up, in
`docs/waves/patch-surface.md`. In brief:

- **The six `*Patch` bodies now have one definition each**, in
  `packages/contracts/src/wire/patches.ts`, adopted on BOTH sides in the same
  diff — types, and at runtime too: each service's `FIELDS` is
  `Object.keys(<Contract>.shape)` and each `refusedField` ends by parsing the
  document through the contract.
- **The unknown-field refusal runs BEFORE the parse**, because zod strips
  unknown keys rather than rejecting them; and no dispatch reads `parsed.data`,
  because a patch body distinguishes absent from null from a value (D182).
- **Finding 4's null question resolved four-to-one, not either way.**
  `shipping_charge`, `pool_oz_deducted`, `pool_remediation` and `fee` lost their
  null (their exchange shadows are all typed `number` and were reached by cast;
  every reader is `?? 0`). `refiner_id` kept it — a nullable FK is not a fee,
  and every engagement starts null. `RefinerItemPatch`, whose two declarations
  already agreed, keeps all five of its nulls and is the control.

**So A3 is not 29 any more and it never was six.** Re-derived after this pass:
**zero `*Patch` remain and fourteen `*Input` do**, and the suffix scan flatters
them — most are repo INSERT shapes (`DirectInput`, `MethodInput`,
`ShipmentLinkInput`, `RateInput`, `ReviewInput`), not request bodies that cross
to a client. `InvoiceInput` / `PackingListInput` are PDF render arguments and
cross nothing. Whoever takes the remainder should apply this pass's test rather
than the suffix: **is this shape declared on both sides of a wire?** For the six
above the answer was yes for all six, which is why they were worth moving.
