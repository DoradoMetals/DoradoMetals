# Phase 3 Frontend — one home for every type

Ruling 39 (Jacob): *"We shouldn't have types — except for like, reasonable
things i.e. a client only onClick handler — living in feature code."*

Scope: `frontend/**` plus `packages/contracts/**`. The SEAMS lane owns
`api/features/**` and `api/legacy/**` concurrently; nothing here touches them.

```
1. Census: DATA or UI, asked per declaration   ██████████████████  100%
2. The zod schemas                             ██████████████████  100%
3. Data types that duplicate a contract        ██████████████████  100%
4. Request bodies into the contracts           ██████░░░░░░░░░░░░   33%
5. Single-file types stop exporting            ██████████████████  100%
```

Started from `a8d408ae`.

**Exported type-like declarations in `frontend/features`: 161 -> 132.**
Twenty-nine gone: eleven pointed at a contract, thirty stopped being
exported, two were dead and deleted. (The arithmetic overlaps — a
declaration re-pointed at a contract is still a re-export.)

**`audit:frontend-nullability`, before and after:**

| | schemas | files | fields compared | stricter than the column | **parsed at runtime** |
|---|---:|---:|---:|---:|---:|
| before | 17 | 12 | 49 | 24 | **1** |
| after | 17 | 12 | 49 | 24 | **0** |

**The one runtime finding is gone, and not by being un-measured.** The
denominator is identical — same 17 schemas, same 12 files, same 49 fields.
Nothing was moved out from under the audit. The finding was
`userSchema.name` reached through `adminSalesOrderCheckoutSchema`, and it went
because that schema stopped embedding a form schema and started naming the
shape the value actually has. Task 2 below is that story.

The 24 remaining are the audit's own documented false-positive class: four
payout form schemas asking a human for bank details, `addressSchema`, and
`scrapSchema`. A form schema *should* be stricter than its column.

---

## Task 1 — the census

161 type-like exported declarations across 24 `types.ts` files and 14 other
feature files: 106 `type`, 34 `interface`, 20 zod schemas, 1 enum. Counted by
walking every `export type|interface|const` under `frontend/features/**` and
counting the other files that name each identifier.

The test was asked per declaration. What came out of it:

- **DATA** — 11 declarations were a row, a wire shape or a request body,
  hand-written in a feature. Every one of them disagreed with the real shape
  in at least one field.
- **UI** — the large majority. Props interfaces, status-config maps, the
  payout and package option catalogues, the Google Places JS shapes, form
  schemas. These stay.
- **Neither, exactly** — 11 request bodies whose destination is right but
  whose contents this wave declined to guess. Listed at the bottom, with the
  reason, which is the more important half of that entry.

## Task 2 — the zod schemas

Twenty found (ruling 39 says twenty-two; four `auth` schemas use a
`z\n.object` continuation the count's regex misses, and two were already
contract-derived). Verdicts:

**LEFT, and they are Jacob's exception — a form is UI:**

| schema | why it stays |
|---|---|
| `addressSchema` | blocked city list, US-state name↔abbreviation transform, error copy. Stricter than the columns on purpose. |
| `signUpSchema` / `signInSchema` / `resetPasswordSchema` / `changePasswordSchema` | password strength rules, a terms checkbox, a confirm-match refine. None is a column. |
| `pickupSchema` | matches no table by design; the audit already reports it 0-of-6 against `carrier_pickups`. |
| `packageSchema` | box dimensions a human types, plus `icon: z.any()`. |
| `insuranceSchema` | a declared value a human enters. |
| `serviceSchema` | see the open question at the bottom — the one I would not decide blind. |
| `echeckSchema` / `achSchema` / `wireSchema` / `doradoAccountSchema` / `payoutSchema` | bank details a human types, with a `confirmation` checkbox that is not a column at all. |
| `scrapSchema` | the scrap-entry form's resolver. |
| `purchaseOrderCheckoutSchema` / `salesOrderCheckoutSchema` / `orderReturnShipmentSchema` / `sellCartItemSchema` | compositions of the above. Their *leaves* are where the data/UI line runs, and the leaves that are data (`Address`, `UserAddress`, `SpotPrice`, `productSchema`) already come from the contracts. |

**MOVED — one, and it was the sharp end:**

`adminSalesOrderCheckoutSchema.user` was `userSchema`, the ACCOUNT FORM's
schema: better-auth's camelCase session shape with `name` required non-empty.
It is now the contracts' `User`.

The compiler found why it mattered. `setCreateSalesOrderUser` has exactly one
caller — the "Create Sales Order" button in the admin users drawer — and it
hands over a row from `GET /users/get_all`, which is **snake_case and
API-sourced**. The drawer store typed that slot as the session user and it
compiled anyway, because every field of the form schema except `email` and
`name` is optional, so a snake_case object satisfied it vacuously.

**Two things this changes on the checkout path, deliberately:**

1. `created_at`, `updated_at` and `email_verified` were being **stripped by
   zod** from every admin sales order. They now travel.
2. A customer whose `users.name` is NULL threw a `ZodError` in the browser at
   the Stripe confirm. The column is nullable; that no longer throws.

Safe in both directions, and this was checked rather than assumed: the server
reads exactly two fields off the object. `adminCreateSalesOrder` in
`api/features/orders/service.ts` types its own parameter
`{ id: string; dorado_funds?: number | null }`, and
`api/features/payments/service.ts` types the same object
`{ id?: string; dorado_funds?: number | null }` for the intent update. Both
shapes carry both fields.

`userSchema` itself stays where it is, as the account form's resolver, with
its two jobs written down at the declaration.

**A measurement note that cost twenty minutes and is worth keeping.**
`audit:frontend-nullability` builds its "parsed at runtime" set by walking a
parsed schema's body for `\w+Schema` — **and that regex reads comments.** The
first version of the replacement mentioned the old identifier in a comment
inside the object, and the audit went on reporting the finding after the code
had stopped having it. The comment now names the file instead, and says why.
Same shape as D171: a count is a claim about what was counted.

## Task 3 — data types that duplicate a contract

Eleven declarations, six features. Every one of them was wrong somewhere, and
the compiler found each fault the moment the true shape arrived.

| was | now | what the hand-written one got wrong |
|---|---|---|
| `reviews.Review` | contracts `Review` | 8 of 9 fields declared required against NULLABLE columns; timestamps `Date` against a string wire. |
| `reviews.NewReview` | contracts `CreateReviewBody` | see below — the contract was the wrong one. |
| `leads.Lead` | contracts `Lead` | `phone`, `email`, `contact`, `notes` required against nullable columns; timestamps `Date`. |
| `leads.NewLead` | contracts `CreateLeadBody` | see below. |
| `rates.Rate` | contracts `Rate` + new `AdminRate` | **one type standing in for two wire shapes**, and a field that does not exist. |
| `carriers.CarrierService` | contracts `CarrierService` | 24 fields transcribed all-required against a row where all but three are nullable. |
| `shipping.Shipment` | *deleted* | thirteen fields of the LEGACY exchange row, imported by nothing. |
| `users.AdminUser` | contracts `User` | `email_verified: string` against a boolean column. |

**`CreateReviewBody` and `CreateLeadBody` were already in the contracts, and
both were wrong.** Neither was imported by anything — API or frontend — so
nothing had ever checked them.

- `CreateReviewBody` declared three fields. The API's own repo types its
  argument `Pick<ReviewRow, "review_text" | "rating" | "created_by" |
  "updated_by" | "name" | "hidden">` and `create.sql` inserts exactly those
  six. **The missing one is `hidden`**, which `get_public.sql`'s header calls
  "the ENTIRE difference between this and get_all" — and the admin table
  creates with `hidden: true` precisely so a seeded review is not published by
  the act of creating it. A frontend narrowed onto the three-field version
  would have stopped sending it and `r.hidden ?? false` would have published
  every admin-created review. Widened to six.
- `CreateLeadBody` omitted `created_by`/`updated_by` (which the create *does*
  accept, and which the frontend *does* send) and admitted five columns the
  create does not take. Rewritten to mirror the API's own `NewLead`.

This is the lesson worth carrying: **a contract nobody imports has never been
checked.** It is the same defect as a hand-written type, wearing the
contracts package as a costume.

**`rates` was the largest single find.** Two wire shapes — `/rates/get_all`
drops the audit columns, `/rates/get_admin` keeps them — were served by one
frontend type carrying the union of both, with `metal_id` and `unit` marked
optional so it could pass for either. `RatesCard` reads `metal_id` off it.
Added `AdminRate` and `RateInput` to the contracts; the reads and mutations
now name which one they mean.

And inside that: **`RatesAdminTable` sorted on `r.material`, a field that
exists on no wire shape and in no column.** The hand-written type declared it,
so it compiled. Both operands were `undefined`, `undefined === undefined` is
true, and the `localeCompare` branch has never once executed. Replaced with
the `min_qty` comparison that is what actually ran.

**Two different things are called a user in this tree and they do not match.**
`AdminUser` is our `/users` wire, snake_case, from the API. `User` is
better-auth's session user, camelCase, from `authClient.getSession`. They are
not interchangeable and neither is a rename of the other; both now say so at
the declaration. `IntentParams.user` genuinely receives both and is typed as
the union, which is what its two call sites actually pass.

Six null-guards and two `Date`→ISO-string conversions fell out of these, each
matching what already ran (`Math.round(null)` is 0; `JSON.stringify(Date)` is
the ISO string). `formatFullDate` was widened to accept `null`, which its
first line has always handled — a signature denying a case the body supports,
D170's shape.

## Task 4 — request bodies into the contracts (partial, deliberately)

Three landed, as part of task 3: `CreateReviewBody`, `CreateLeadBody`,
`RateInput`. Each was pinned by reading the endpoint's own service and SQL.

**Eleven did not, and this is the wave's declared remainder:**

`OrderPatch`, `ReturnShipmentOnPatch`, `OrderItemPatch`, `OrderItemScrapPatch`,
`OrderItemBullionPatch`, `NewScrapItem`, `OrderSpotWrite`, `PayoutPatch`,
`ShipmentPatch`, `RefinerItemPatch`, `RefinerOrderPatch`, `RefinerSpotWrite`,
`SalesOrderQuoteBody`.

They are DATA and their home is `@dorado/contracts`. They are not moved
because **an input contract is only worth having if it is pinned to what the
endpoint actually accepts**, and this wave measured the cost of the
alternative: two such contracts already existed, adopted by nobody, and both
were wrong. Adding eleven more unverified ones would multiply that defect
while looking like progress. Pinning each means reading the API's service and
SQL, and `api/features` is another lane's this session.

Several also carry width that must survive the move, stated at their
declarations: `OrderItemScrapPatch.scrap` is `Record<string, unknown>` because
the write sets every column it knows and a partial would null the rest;
`premium` and `quantity` are **required and nullable**, not optional, for the
same reason.

## Task 5 — single-file types stop exporting

**Thirty declarations stopped being exported**, each used in exactly one file
— its own — which makes it an implementation detail rather than a contract
(ruling 38's second arm).

Twenty-one UI: `AddressCardVariant`, `AddressCardProps`, `CartIconProps`,
`MenuIconProps`, `PremiumControlProps`, `AccountActionProps`,
`PlacesJsPlacePrediction`, `IntakeMethod`, `IntakeOption`, `RouteConfig`,
`PackageOption`, `PurityOption`, `MetalOption`, `WeightOption`,
`UserRoleOption`, `PaymentMethod`, `PaymentMethodType`,
`paymentMethodTypeSchema`, `SalesOrderService`, `OrderListSnapshot`,
`GetRatesInput`, `IntentParams`.

Nine react-query mutation variable bundles: `PatchOrderVars`,
`PatchOrderItemVars`, `CreateOrderItemVars`, `DeleteOrderItemVars`,
`SetOrderSpotsVars`, `PatchPayoutVars`, `PatchShipmentVars`,
`PatchRefinerItemVars`, `PatchRefinerOrderVars`. An id plus a patch plus
whatever the cache needs is plumbing; it never crosses the wire as a unit.

**Two were dead and were deleted** (ruling 32): `PayoutInput`, a
discriminated union restating `payoutSchema` in TypeScript with zero
references anywhere including its own file; and `SalesTaxInput`, the argument
shape of the client-side tax calculation D82 removed — which was also the only
reason a page of state-by-state legal copy imported `Address`, `Product` and
`SpotPrice`.

**One stayed exported on purpose**: `RateMaterial` in
`features/rates/utils/resolveRate.ts`. It is a parameter type of an exported
function, and that file is mirrored 1:1 with the API's copy under
`api/shared/mirror.test.js`.

---

## LEFT AND LISTED — the open questions

**1. `serviceSchema` / `ShippingRate` are two hand-written declarations of one
wire shape, and one of them types a `Date` where JSON carries a string.**
`features/service/types.ts` and `features/shipping/types.ts` both describe the
carrier's rate quote. `serviceSchema` has `transitTime:
z.preprocess(str => new Date(str), z.date())`; `ShippingRate` declares
`transitTime?: Date` and `serviceSelector.tsx` does `rate?.transitTime ?? new
Date()` on a value that is a **string** at runtime. Not moved: this is the
money path, `serviceSchema` is parsed by both checkout schemas, and resolving
Date-vs-string correctly means reading the FedEx adapter's response shape.
Moving the declaration without deciding that would put the lie in the
contracts.

**2. The rest of `features/shipping/types.ts` is the carrier adapter's
surface** — `ShipmentTracking`, `ShippingPickupTimes`, `ShippingLocation`,
`ShippingLocationsReturn`, and the six `*Input` request bodies. These are
data and they belong in the contracts. Same reason as task 4: unverified.
`ShippingRatesInput`'s optional `carrier_id` is deliberate width with a
comment explaining a production UUID that used to be compiled into a
component — it must not be narrowed.

**3. `features/products/types.ts` has three admin shapes with no contract** —
`AdminProduct` (37 fields), `AdminMints`, `AdminTypes`. No contract covers the
admin products endpoint; the file already says so. Adding one means deriving
it from the endpoint, not from the interface.

## For the API lane / follow-up

- **Ruling 37's other half.** `ServiceInput` in
  `api/features/shipping/services/service.ts` is the named example, and the
  frontend's `NewCarrierService` is the same body seen from the sending side.
  They cannot become one contract without changing both in the same pass. The
  `flag()` helper's `false`-vs-`undefined` distinction must survive it.
- **`audit:frontend-nullability` only walks `frontend/`.** Now that schemas
  are moving into `@dorado/contracts`, a schema that leaves the frontend
  leaves the audit. It did not happen this wave — the denominator is
  unchanged — but the audit lives in `api/scripts/` and someone should teach
  it to follow.
- **D103 is still open in two places**, both now documented at the
  declaration: `leads.leads.priority` and `metals.name` are plain `text`, and
  the frontend's `LeadPriority` / `Metal` unions are constraints the database
  does not have. The fix is a real enum on the new schema plus a regenerate —
  a migration, which this wave does not write.

## Verification

| gate | result |
|---|---|
| `@dorado/frontend typecheck` | clean |
| `@dorado/frontend test` | **163 passed (23 files)** |
| `@dorado/frontend build` | exit 0 |
| `@dorado/frontend lint:call-site-styling` | exit 0 |
| `@dorado/frontend lint:typography-scatter` | exit 0 |
| `@dorado/contracts build` | exit 0 |
| `@dorado/contracts verify:fresh` | every generated file matches the database |
| `@dorado/contracts validate` | **36/36** tables validate cleanly |
| `audit:frontend-nullability` | 49 compared / 24 stricter / **0 at runtime** |
| `@dorado/frontend audit:state-collapse` | **exit 1 — NOT THIS LANE.** Five D95 SUSPECT findings, in `PasswordRequirements.tsx`, `PayoutCard.tsx`, `TrackingEvents.tsx`, `RadioGroup.tsx`, `SidebarLayout.tsx`. All five are byte-identical to `a8d408ae`; none is in this lane's changed-file list. The audit exits 1 on any `lightGrounds` entry, and this lane contributed none. |
