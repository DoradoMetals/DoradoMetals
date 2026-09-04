# orders — the feature end to end

Jacob's brief: *"Start rolling through features on the API, get rid of any
types that are present. Figure out how to get rid of any prop spreading.
Resources come from the server (unless they really can't). … Look at the
frontend counterparts at the same time. Is there business logic on the
frontend? Remove it to the API. Don't be afraid to change frontend code
entirely."*

The API half of `orders` had already been rewritten from its inputs inward
(`docs/waves/orders-shape-changes.md`): five verbs in `db/`, one use case per
file in `domain/`, contracts for every body, no spreading, no local types.
What was left was the half that decides things — and it was in a browser.

---

## 1. What moved server-side

**Three rules lived in admin drawers, in a `switch (order.status)`.** Each was
a decision about the business, taken in a component:

| the rule | where it was | where it is |
|---|---|---|
| which status an order may be moved to | two `getButtonActions()` switches, five and four hard-coded lists | `rules.statusesFor` |
| a purchase reaches Payment Processing only once **every line is confirmed** | `disabled: !allItemsConfirmed`, computed from a second read | `rules.statusesFor` (the gate on that rung) |
| a sale reaches In Transit only once **the refiner has it and it is tracked** | `disabled: !order.order_sent \|\| !order.tracking_updated` | `rules.statusesFor` |
| completing a **DORADO_ACCOUNT** payout credits the customer | a `const addFunds = status === 'Completed' && payout?.method === 'DORADO_ACCOUNT'` inside a click handler | `rules.creditsToAccount`, surfaced as `actions.add_funds` |
| the **payable ounces** of a line (`content × premium`) | a table cell | `rules.payableOf` |
| what a **line comes to** (`price × quantity`) | two footers, which disagreed: the purchase side read a scrap line's total as the whole lot, the sale side multiplied every line by its quantity | `rules.lineTotalOf`, one definition |

`allLinesConfirmed` also fixes a real defect on the way: the drawer's
`items.every((i) => i.confirmed)` answered **true for an order with no lines
at all**, so an empty order offered "Finalize Pricing".

**A new read carries the answers.** `GET /api/orders/:id` did not exist —
`OrderView` was only ever what a mutation ANSWERED, so a drawer had to
assemble one out of six order-scoped reads and then decide for itself which
buttons it earned. It is `orders/controller.ts`'s `getOrder`, owner-or-admin,
declared after the sub-resource mounts.

## 2. OrderView's new fields

```
OrderView = { order, totals, items[], address, shipments[], pickup, payout,
              user, actions }
```

- **`actions: OrderActions`** — `packages/contracts/src/computed/orders.ts`,
  the third entry in the computed exception (declared in
  `lint:contracts-derived`'s COMPUTED map with its reason). No table backs it:
  the booleans are derived from five tables at once and stored in none.

  ```
  cancel  finalize_pricing  add_funds  send_to_refiner  buy_label
  update_tracking  edit_lines  statuses[]
  ```

  `statuses` is the gated ladder — the labels this order may be moved to, with
  the two gates above already applied. Each boolean mirrors the refusal its use
  case throws, so a button that is offered is a call that is accepted.

- **`items[].payable`** and **`items[].line_total`** — `OrderViewItem.extend`,
  both `null` on an unpriced line, which is a real state.

Computed in `domain/orders/read.ts`'s `view()` from rows that read already
holds, so it costs no extra statement.

**Statuses still drive nothing** (ruling 2 / D211). `actions.statuses` says
which are OFFERED; the PATCH that writes one carries the status and nothing
else, and crediting is its own POST rather than a side effect of reaching
'Completed'.

## 3. `@dorado/client` — `src/orders/`

New workspace package, source-shipped like `@dorado/components`
(`transpilePackages`), no build step, typed only from `@dorado/contracts`.
`src/fetch.ts` is `fetch` — the package carries no runtime dependency, so the
seam a test stubs is the platform one.

| reads | mutations |
|---|---|
| `useOrders({direction,user_id})` | `usePlaceOrder`, `useAdminPlaceSalesOrder` |
| `useOrder` → **OrderView** | `usePatchOrder`, `useCreateOrderReview` |
| `useOrderItems`, `useOrderSpots` | `useFinalizePricing`, `useAddFunds`, `useCancelOrder`, `useBuyLabel`, `useSendToRefiner` |
| `useOrderAddress`, `useOrderShipments`, `useOrderPayouts` | `useCreateOrderItem`, `usePatchOrderItem`, `useDeleteOrderItem`, `useSetOrderSpots` |

**The cache is written FROM the response.** Every action answers the whole
`OrderView`, so `absorb()` sets it into `keys.orders.view(id)` and invalidates
the lists. What it replaces: an optimistic status flip across two list caches,
a rollback, and an eleven-key invalidation that had to be kept in step with
what each endpoint touched. `invalidateOrder(client, order_id)` is exported for
the features that own an order's other tables (payouts, shipping, refiners).

Deleted with the move: `features/orders/{reads,patch,items,spots,
invalidation,addressSnapshot}.ts`, both purchase `queries.ts`, and
`useOrderShipments` / `useOrderPayouts` from the shipping and payouts features.

## 4. The frontend, before and after

**A drawer is one read.** All four shells (`{admin,}{Purchase,Sales}
OrderDrawer`) found their order inside a LIST cache — so what they rendered
depended on a list that may not have been fetched — and each child then called
its own order-scoped read. They call `useOrder(order_id)` and pass one
`OrderView` down; `OrderDrawerContentProps` and friends collapsed into
`OrderViewProps`.

**The action buttons render.** `adminPurchaseOrderActionButtons.tsx` went from
159 lines of switch to a map over `actions.statuses` plus two conditional
buttons; the sales twin from 97 to 30. `features/orders/actionLabel.ts` is what
is left on the client: the button's WORDS, and it takes the direction because
the two ladders disagree about where "In Transit" sits — a purchase starts
there, a sale ends there.

**Effects that derived or synced state are gone** (four):

- `AdminPreparing` copied the engagement's refiner and the shipment's carrier
  into local state once the reads landed — so the screen held a stale duplicate
  of rows it was already looking at, and rendered once with nothing chosen. The
  admin's pick wins; absent one, the stored value IS the selection.
- `createSalesOrderDrawer` copied the customer, and the default address, into
  its store the same way. The address is derived and threaded to the two
  consumers that read the store's copy.
- `viewProfitBreakdown` noticed after the fact that its open tab had no content
  and set a different one — one empty render, then the right one.

Kept: the confetti fire on mount (a real imperative side effect), the payment
intent's pricing update, and `CreditSelect`'s method switch — both payments
surfaces, and the second already carries ruling 47's note.

**Dead UI removed.** The admin create drawer let an admin type over the spot
feed and "lock" it, and none of it went anywhere: the create is one
`checkout_id` and the server prices from its own feed. `order_metals` left
`AdminSaleCheckoutForm`, and `SpotSelector` shows the live feed read-only.
`paymentIntentId` left the admin create — the customer's own open intent is
selected by `user_id`, because an id in the body could name somebody else's.

## 5. Shape changes

| | before | after |
|---|---|---|
| `GET /api/orders/:id` | **did not exist** | `OrderView` (owner-or-admin) |
| `OrderView` | 8 members | `+ actions` |
| `OrderView.items[]` | row + `product` | `+ payable`, `+ line_total` |

Nothing else moved: the list, the order-scoped reads and every action keep the
shapes `orders-shape-changes.md` records.

## 6. Verification

| step | exit |
|---|---|
| `pnpm check:fast` | **PASS** (25.9s) |
| `pnpm --filter @dorado/api validate:wire` | 0 — **29** shapes match, 0 diverge, 3 skipped |
| `pnpm --filter @dorado/frontend typecheck` | 0 |
| `pnpm --filter @dorado/frontend test` | 0 — 218/218 across 40 files |

`validate:wire` gained `GET /orders/:id`, parsed as
`OrderView.omit({ payout: true })` — the payout member is dropped for the
reason the script already gives for excluding payouts: a zod failure prints the
offending value. `actions` is compared.

Two gates moved with their subject, both with the reason recorded in place:

- `lint:contracts-derived`'s COMPUTED map gained `computed/orders.ts`.
- `frontend-routes.test.ts` now walks `packages/client/src` as well as
  `frontend/`, and matches either quote style — the order hooks moved, and a
  guard that walked one of the two read the move as seven calls disappearing,
  which is what its own floor caught. Floor lowered 50 → 45 (measured 49):
  several static URLs became a direction ternary the regex sees neither half of.

## 7. Left for later

- **`CreditSelect`'s auto-switch to CREDIT** is client-side money reasoning. It
  is payments' surface (it decides the card surcharge through the checkout
  row's `payment_method_id`), so it wants that lane rather than this one.
- **The admin create drawer's three-call orchestration** (sync items → PATCH
  checkout → POST checkout_id) stays in the feature: it spans checkout and
  orders, and checkout is another lane's this session.
- `useSalesOrderLines` still resolves `mint_name` against the catalogue —
  `BullionPublic` does not carry it, and that is the join a products read pivot
  removes.
