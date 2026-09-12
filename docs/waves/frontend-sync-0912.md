# Frontend sync, 2026-09-12

The facts lane (`docs/waves/facts-and-positions.md`) dropped
`orders.orders.status`, turned `OrderView.actions` from a booleans-object into
`Action[]`, and renamed several actions. This pass brings the admin order
screens back to typecheck 0 against that shape. Scope: the admin order list
and the admin order detail screen. Nothing else in the frontend read `status`
or the old `actions` shape.

## What changed

- **`frontend/shared/utils/orderState.ts`** (new) — `orderStateBadge(state)`
  maps an `OrderState | 'Draft'` label to a `{ intent, variant }` pair for the
  existing `Badge`: Warning for the first outstanding fact (`Awaiting
  Receipt`, `Awaiting Payment`), Info for the middle facts (`At Refiner`,
  `Awaiting Payout`, `Preparing`, `In Transit`), Success for the last stretch
  (`Ready to Pay`, `Completed`), Danger for `Cancelled`, Neutral Outline for
  `Draft` (drawn in Figma only — no live order ever carries it).
- **`frontend/shared/utils/actions.ts`** (new) — `findAction`/`hasAction` over
  an `Action[]`, replacing the old boolean-flag reads (`actions.cancel` ->
  `hasAction(actions, 'cancel')`).
- **`frontend/app/admin/_src_/AdminIndex.tsx`** — the Orders table's `Status`
  column is now `State`, rendered as a `Badge` via `orderStateBadge`.
- **`frontend/app/admin/_src_/orders/OrderHeaderCard.tsx`** — takes an
  optional `state` prop and renders it as the state badge; falls back to the
  old plain "Cancelled" badge when no `state` is passed (kept for the header's
  own unit tests, which exercise `cancelled` directly).
- **`frontend/app/admin/orders/[id]/_src_/AdminOrderScreen.tsx`** — the main
  rewrite:
  - `cancelled` is now `view.order.cancelled_at !== null`; `view.state` feeds
    the header badge.
  - `cancel`, `reopen`, `edit_lots`, `lock_spots`, `unlock_spots` are plain
    presence checks (`hasAction`).
  - `finalize`, `send_payment`, `refining_sale`/`supply` (the "Create Sale"
    button, split by direction: sale orders supply from the refiner pool via
    `useSupplyOrder`, purchase orders sell lots to a refiner directly via
    `useCreateRefiningSale`) run through one `runAction(action, run)` helper:
    no `confirm` reason runs immediately, a `confirm` reason opens one shared
    confirm `Dialog` (built from `packages/components`' existing `Dialog` /
    `DialogContent` / `DialogFooter` — no new component) showing the reason,
    and only runs on "Continue".
  - `add_funds` (override class) got a small button + reason line next to
    Payment: enabled and callable while `override` is `null` (first credit),
    disabled with its reason text once `override` is set (already credited).
    No step-up UI — see Stubbed below.
  - `useSupplyOrder` and `useAddFunds` (already exported by `@dorado/client`,
    previously unused) are now wired in; no client hooks needed adding or
    deleting — the renamed-action endpoints (`finalize`, `cancel`, `reopen`,
    `refining-sale`, `supply`, `add_funds`) already had correctly-shaped
    hooks in `packages/client/src/orders/queries.ts`.
- **Tests**: `frontend/app/admin/_src_/orders/tests/fixtures.ts` (`anActions`
  now builds an `Action[]` from a `{name: boolean | {confirm?, override?}}`
  map; `aLot`'s inner lot gained the `declared_*`/`assayed_at`/
  `combined_into_id` columns; `anOrderView` dropped `status`, added
  `cancelled_at` and top-level `state`; `aFulfillment.actions` gained
  `moves: []`), `cards.test.tsx` (two `unlock_spots` checks now go through
  `hasAction`; the "shape the contract accepts" test now parses through the
  real `OrderActions` zod schema instead of asserting on deleted fields),
  `orderScreen.test.tsx` (cancelled-order fixture, two new hook mocks),
  `adminIndex.test.tsx` (local fixture's `status` -> `state`).

## Stubbed

- **`add_funds` override.** Ruling 112's step-up flow (`POST
  /api/account/step_up`, 300s window) has no UI anywhere in the frontend yet.
  When the action carries a non-null `override` reason the button is
  rendered disabled with that reason beside it; there is no way to clear the
  override and no path that calls the endpoint with an `override_reason`.
  Building the step-up UI is a separate piece of work.
- **`FulfillmentActions.moves`** (the ladder-external transition list with
  its own `confirm` reasons, from ruling 112 applied to
  `assertTransition`/`transitionConfirm`) is not consumed anywhere — the
  pickup/direct/dropoff cards in `ScheduleCards.tsx` still gate off
  `actions.transitions` only, unchanged from before this pass. Fixtures were
  updated to carry `moves: []` for typecheck, but no screen offers a
  confirm-carrying out-of-ladder move yet.

## API shape found missing for a screen

- **`buy_label`, `ship`, `update_tracking`, `assign_lots`** appear in
  `OrderActions` but have no button anywhere in `AdminOrderScreen` — they
  didn't before this pass either (no regression), but the facts lane didn't
  add UI for them and none existed previously. `buy_label` has a ready hook
  (`useBuyLabel` in `packages/client/src/shipping/queries.ts`) that is
  unused. `ship` gates nothing concrete server-side (no `/ship` endpoint —
  it is a readiness signal), `update_tracking` and `assign_lots` likewise
  have no wired affordance. Left alone rather than guessed at.
- **`POST /api/emails/pickup_complete`** (new, replacing the automatic send
  `set_status` used to fire) has no client hook and no button. The pickup
  card (`PickupCard` in `ScheduleCards.tsx`) has no "send" affordance at all
  today, so there's no natural existing spot to slot it into without adding
  a new interaction, which this pass didn't do.
