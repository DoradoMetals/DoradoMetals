# Wave 5B — the carrier's vocabulary leaves the browser

Scope, by FEATURE and not by tree (D114): `api/features/shipping/**`,
`api/features/fulfillments/**`, and `frontend/features/{shipping,checkout,
handoff,insurance}/**` — both halves of each, because wave 4's api/frontend
split is what left two money fixes half-done.

```
1. Carrier vocabulary off the frontend      ██████████████████  100%
2. Scrap + bullion legacy layers - REASSIGNED TO 5C  ░░░░░░░░░░░░░░░░░░    0%
```

Started from `a2599311`. A second agent is dissolving
`api/features/{purchase-orders,sales-orders}` in the same working tree; nothing
below touches those, `api/legacy/`, or `frontend/features/orders/`.

## The defect, as found

Three things the browser knew that belong to a carrier:

| where | what it spelled |
|---|---|
| `frontend/features/handoff/types.ts` | `pickupOptions`, a record **keyed by** `DROPOFF_AT_FEDEX_LOCATION` and `CONTACT_FEDEX_TO_SCHEDULE` |
| `frontend/features/service/types.ts` | `serviceOptions`, a record **keyed by** `FEDEX_EXPRESS_SAVER` and `PRIORITY_OVERNIGHT`, each carrying FedEx's `FDXE` carrier code |
| `checkoutStepper` / `shippingStep` / `pickupScheduler` | five branches on `pickup.label === 'CONTACT_FEDEX_TO_SCHEDULE'` — the browser deciding what to render next from a carrier's enum |

Plus a fourth, found on the way and the same family: the FedEx carrier's
**production uuid `30179428-b311-4873-8d08-382901c581d8` was a literal at three
checkout call sites**, one with `// TODO: source from store when you add carrier
selection` beside it.

## What it is now

The carrier's vocabulary lives with the carrier's adapter and is served as
reference data. The frontend renders `name`, branches on flags, and hands
`code` back without reading it — ruling 12, rows out and ids in.

**API (new):**

- `api/features/shipping/operations/adapters/fedex.catalogue.ts` — FedEx's own
  words, once, on the server.
- `api/features/shipping/operations/catalogues.ts` — the **third map keyed the
  same way as `PROVIDERS` and `BUILDERS`**. `resolveCarrier` looks all three up
  with one key and throws if any is missing, so a carrier registered in one and
  forgotten in another fails at the call rather than half-working.
- `api/features/shipping/handoffs/` — its own service, controller and routes
  (ruling 26). No repo and no table, and the header says so: `pickup_type` is a
  text column holding two values a carrier defines.
  **`GET /api/shipping/handoffs`**
- `getOfferedServices` on `shipping/services` — the resource that owns carrier
  services. **`GET /api/carrier_services/offered`**
- `api/features/shipping/routes.ts` — the shipping parent, mounting `handoffs`
  and then `operations` at `/`. **Every existing URL is byte-identical**
  (ruling 13); `app.js` changes one import specifier.
- `resolveShippingCarrierId` / `carrierIdOr` in the resolver — **`carrier_id` is
  optional on every shipping operation now.** Exactly one carrier has a provider
  registered, so the server can answer "which carrier"; two would make it a
  business question and it throws rather than picking. **Memoised for five
  minutes, and that is D101 rather than tidiness**: resolving it costs two round
  trips at a measured 130ms each, on the checkout's most-hit path, to answer a
  question whose answer has not changed since 2025-06-20 in either database. The
  TTL is the window in which an admin renaming the carrier's organization takes
  effect — a rename that breaks every label anyway, because `resolveCarrier`
  looks the provider up by that same name. Naming a carrier never touches the
  memo at all.

**Frontend:**

- `useCarrierHandoffs()` / `useCarrierServiceOptions()` in
  `features/shipping/queries` — reference reads, cached an hour, no carrier id.
- `pickupOptions` and `serviceOptions` deleted. `pickupSchema`, `serviceSchema`
  and `packageSchema` **untouched** — they are `.parse()`d on the money path.
- `PickupSelector` and `ServiceSelector` are presentational (ruling 14): options
  in, selection out. Eight render tests.
- Icons stay client-side (Jacob) but are **keyed by behaviour, not by name** —
  `handoffIcon` reads `requires_schedule`, `serviceIcon` reads `display_order`.
  A map with `DROPOFF_AT_FEDEX_LOCATION` on the left would have put the enum
  back in the browser for the sake of a picture.
- **The two response shapes are declared ONCE**, in
  `packages/contracts/src/wire/shipping.ts` — they were written twice the moment
  the read existed (once for the API service, once for the hook), which is the
  duplication the contracts package exists to prevent. Both halves import them.
- `lint:carrier-vocabulary` (frontend), **added as a 22nd member of
  `pnpm check`** — 375 files, instant, `--self-test` proves it fires. Comments
  are stripped so the write-ups that explain the change do not read as the
  defect; strings are not.

**Zero live carrier enum values remain in `frontend/`.** Every match is a
comment explaining what used to be there.

## Nothing on the money path moved

- The three parsed schemas keep their shape, field names and validation.
- The order create body is unchanged: `pickup.label`, `pickup.name`,
  `service.serviceType` and `service.code` still travel through it with the same
  values — they are RECEIVED from the server now instead of declared in the
  browser, and handed back without being interpreted. `pickup.name` is what
  lands in `shipments.pickup_type`; production holds 62 rows reading exactly
  `Store Dropoff` and `features/media/pdfs` compares against that string twice.
  Pinned by a test that says so.
- Nothing was reordered around the Stripe confirm (D49).
- No arithmetic on a price was added or moved (D82).
- **No migration written, nothing dropped, `exchange` untouched.**

### One behaviour change, deliberate and recorded

`useGetRatesInput` used to refuse to build an input until `carrier_id` existed
(always, it was a literal). It now refuses until the **handoff** is known.
`pickupType` changes what the carrier quotes, and the default used to be a FedEx
enum spelled in `checkoutStepper` — present on the first render. It comes from
the reference read now, so for one tick there is no handoff, and
`pickupType: ''` would ask the carrier to rate a handover it does not recognise.
The rate quote arrives one tick later instead of being wrong.

## Four files outside this wave's two features, and why each

Named rather than buried, because three lanes share this tree.

- `api/app.js` — **one import specifier**, `#features/shipping/operations/routes.ts`
  → `#features/shipping/routes.ts`. No mount path changed.
- `packages/contracts/src/wire/shipping.ts` — **appended only**, the two response
  shapes. `build`, `validate` and `verify:fresh` all clean.
- `package.json` / `frontend/package.json` — the new lint, and it as a **22nd
  member of `pnpm check`**, placed just before the frontend typecheck so a cheap
  member fails early. A guard nothing runs is a guard that rots — the lesson
  D115 paid for.
- `frontend/shared/queries/keys.ts` — two reference query keys.

Also removed: `PickupType` and `ShippingService`, the two interfaces that
described the deleted constants and that nothing else referenced (ruling 32 —
the dead ones go rather than being kept in case).

## Verification

Every member that imports application code was re-run after the last change,
because three gate scripts have been found broken exactly that way — a moved
function still resolves and only fails when called.

| member | result |
|---|---|
| `api typecheck` / `frontend typecheck` | clean |
| shipping + fulfillments suites | **162 / 162, 0 fail** (re-run after the last change) |
| `handoffs` unit + service tests | 18 / 18 (10 catalogue, 8 against real Postgres) |
| `frontend test` | **163 / 163** (23 files; 8 new render tests) |
| `verify:genesis` | OK — no schema changed, and nothing was migrated |
| `validate:wire` | **27 shapes match, 0 diverge** |
| `contracts build` + `validate` + `verify:fresh` | OK, 36/36 tables |
| `audit:routes` | both new routes visible with the right guards, **every existing shipping URL byte-identical** |
| `lint:imports` / `lint:db` / `lint:row-vs-list` / `lint:migrations` / `lint:legacy-boundary` | clean |
| `lint:carrier-vocabulary` (+ `--self-test`) | 376 files, **0 in product code**, 1 in a test fixture |
| `frontend build` | compiled successfully |

`lint:namespace-calls` reports 6 unresolved calls in
`features/sales-orders/*.test.js` — **lane 5A's in-flight dissolution, not this
change**; nothing here touches that tree.

## THE COUPLING NOTHING WAS CHECKING, found while moving the strings

`pickup.name` is not a display string. **Three things read it, and none of them
is a foreign key or a constraint** — values in different modules that must agree
by value, which is the shape of D39 and of every coupling bug this project has
been bitten by:

1. `features/orders/intake.ts` indexes `handoffMethods` **by this string** to
   choose the fulfillment method, and **THROWS** on a name it does not know.
2. `features/orders/service.ts:501` **books a courier** when it equals
   `"Carrier Pickup"` — the string decides whether FedEx is dispatched to a
   customer's door.
3. It is written to `shipments.pickup_type` verbatim, and `features/media/pdfs`
   compares against `"Store Dropoff"` twice to decide what a packing list says.

Nothing connected the offered list to the accepted list. It does now:
`handoffs/tests/unit.test.ts` asserts every offered handoff is a name intake can
file, and that the one that books a courier is the one that collects a date and
a time. Renaming a "display" string here would have refused every order placed
through it.

## Findings, measured against both databases

1. **No production purchase order has ever used a carrier pickup.**
   `exchange.shipments.pickup_type` in production is `Store Dropoff` 62 and
   `DropShip` 9 — `Carrier Pickup` never. The whole scheduler path
   (`check_pickup`, the calendar, the slot list) is unexercised by real traffic.
2. **`code` and `provider_code` are NULL on all eight `carrier_services` rows in
   production and all eight in dev.** That is why the offered-service catalogue
   is served from the adapter rather than the table: no row can say which FedEx
   service it means. Populating them is an UPDATE against production — Jacob's,
   not a migration. The endpoint is already where the table-backed version will
   serve, so the swap is a change of source, not of surface.
3. **Dev's `exchange.carrier_services` holds 2 rows; production's holds 8.**
   Dev's `shipping.services` holds 8. Noted, not touched.
4. The hard-coded carrier uuid was correct — dev and production both give FedEx
   `30179428-…`. It is out of the browser anyway, and a test pins that the
   server resolves the same row.
5. **REPORTED, NOT FIXED — the browser caps the insured value at a carrier's
   limit, and does the arithmetic.** `checkoutStepper.tsx:67` is
   `Math.min(quote?.declared_value ?? 0, 50000)`, and its own comment says
   $50,000 is FedEx's declared-value ceiling. So a carrier's limit is a literal
   in a React component, and the number the label's insurance is bought with is
   computed client-side — the shape D82 exists to forbid.
   `shipping.services.max_declared_value` is the column that should carry the
   ceiling and is **NULL on all eight rows in production and all eight in dev**.
   The clamp belongs in `/quotes/purchase_order`, which already computes
   `declared_value` and is not in this wave's partition. Left alone rather than
   half-moved: clamping against a server-supplied number would still be the
   browser deciding what a customer insures for.

## What is left of task 1, as a named seam

**PACKAGE TYPES, and it is a real one.** `frontend/features/packaging/types.ts`
hand-rolls six boxes, three of them literally `FedEx Small` / `FedEx Medium` /
`FedEx Large`, with a `fedexPackage` boolean and a `fedexPackageToggle` field on
the checkout schema. `shipping.packages` already holds **exactly those nine
rows** (6 FedEx + 3 UPS) with `is_carrier_packaging` as the same flag, and
`InTransit.tsx` already carries a previous agent's note that this is "the one
lookup here that has no reference read behind it yet — flagged rather than
invented".

It was NOT done here, for two reasons that are each sufficient:

- **`shipping.packages` has no weight column.** The browser's per-box weight is
  a FLOOR on billable weight (`Math.max(cartWeight, box.weight)`) and it prices
  the label, so a server-sourced list cannot replace the constant without
  `ADD COLUMN weight_lb` plus a seed — a migration, genesis regeneration and a
  contracts rebuild, while another agent is mid-series in the same tree.
- **`packageOptions` has three consumers in `frontend/features/orders/**`**,
  which is the other agent's live tree, and `fedexPackageToggle` is a field of
  `purchaseOrderCheckoutSchema` declared there. Renaming either crosses the
  partition.

To finish it: the column and its seed, `GET /api/shipping/packages` on the
existing `shipping/packages` repo (which has no controller or routes and should,
per ruling 26), then `packageSelector` and the three drawer readers in one pass,
with `fedexPackage` → `is_carrier_packaging` and `fedexPackageToggle` →
`carrier_packaging`.

`ShippingRate.packagingType` is FedEx's packaging enum riding on the rate
response into the checkout store. It is never read — `checkoutStepper` copies it
onto `data.service` and nothing consumes it. It should be dropped from the store
write when the package work lands.

## Task 2 — REASSIGNED TO LANE 5C, and no evidence was gathered here

The scrap and bullion legacy layers live in `api/features/scrap` and
`api/features/checkout`, neither of which is in this wave's API partition
(`shipping` and `fulfillments`). The coordinator has moved them to lane 5C,
which owns the covenant verification and the deletion (D124).

**Nothing was measured for it here.** No `verify:parity`, no `audit:coverage`,
no decomposition gate was run against checkout by this lane. An earlier draft of
this file said the evidence "is recorded below" and then recorded nothing, which
is worse than silence — a reader sees a claim that evidence exists and stops
looking. It does not exist. 5C starts from zero.
