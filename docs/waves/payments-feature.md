# payments, payouts and credit — the feature end to end

The money lane: `payments.intents` / `.attempts` / `.settlements` / `.details`,
the payout account, the customer credit ledger, and the three customer surfaces
in front of them. Same brief as `orders-feature.md` — five verbs in `db/`, one
use case per file in `domain/`, contracts for every shape, no local types, no
spreading — plus the two rulings that landed with this lane (64: no hand-listed
column arrays; 65: no `throw` in a service file) and one orders fix that had
nothing to do with schemas and everything to do with a customer being unable to
buy anything.

---

## 1. The buy flow was closed, and the 403 was on the last click

`POST /api/sales_orders/create_sales_order` took `requireAdmin`. The comment on
it said so and called reopening "a one-word change here", which undersold it:
that route is the one the **customer** buy checkout posts to. A signed-in
customer could fill a basket, choose an address, choose a delivery service,
choose a payment method, watch Stripe's element mount and price the order — and
then be refused, at the only step that creates anything.

It is `requireUser` now, and **nothing else moved**, because who may place what
was already decided one layer down and correctly:

| the rule | where it lives | answer |
|---|---|---|
| a customer places their OWN checkout | `createOrderFromCheckout`'s subject check | 200 |
| somebody else's checkout is not theirs to place | same, unless admin | 403 |
| a VISITOR may shop and may not buy (ruling 63) | `place()` → `checkoutService.assertRealAccount` | 403 |

`requireUser` is what lets those two rules be *reached* — it answers a visitor,
which is the whole point of anonymous checkout, so the second refusal has to
come from the use case and does. `POST /api/sales_orders/admin_create_sales_order`
stays `requireAdmin`: it is the same handler, and what makes it admin is that
the checkout it names belongs to somebody else.

`api/transport/orders/tests/customer-places-sale.test.ts` pins all three over
real HTTP. It reaches no outside world — the customer's credit covers the
basket, so `placeSale` prices `post_charges_amount` at 0, opens no Stripe
intent and sends no email — which is what makes an HTTP-level placement
testable at all.

`POST /api/sales_orders/create_sales_order` also left
`domain/authorization/admin-routes.json`.

---

## 2. The last money decision left in the browser

`beginning_funds < base_total`, in `salesOrderCheckout.tsx`, deciding whether
to mount Stripe's element. D81–D84 moved every customer-visible NUMBER to the
server and left this behind because it renders a component rather than a
figure — but it is money reasoning, and it was one expression away from the
two rules the charge is actually built from.

`SalesOrderQuote` carries **`payment_surface: "card" | "credit"`** now, derived
in `domain/payments/rules.ts` `paymentSurface` from `post_charges_amount` —
the amount Stripe is actually told. So the surface cannot disagree with the
charge, and it sees the sliver held back below Stripe's minimum, which the old
comparison could not: a $3 balance against a $3.20 total left 20¢ that Stripe
will not take, and the browser's expression said "card".

The checkout reads the field. `frontend/features/checkout/.../surface`
arithmetic is gone.

---

## 3. Ruling 65 — the refusals left the use cases

Every `throw` in this lane's service files moved into a `rules.ts` as a
one-line assert. Not a style pass: a use case now reads as LOAD → ASSERT →
WRITE with no branch in it, and each refusal is stated once, next to the other
refusals of the same thing, where it can be read without the plumbing.

| was | is |
|---|---|
| `payments/service.ts` × 4 | `rules.assertBillingIdentity` / `assertIntentSubject` / `assertPriceableBalance` |
| `payments/webhook.ts` × 1 | `rules.assertWebhookMatched` |
| `payments/details/service.ts` × 3 | `details/rules.ts` `assertResolvedMethod` / `assertWrittenDetails` |
| `payouts/service.ts` × 3 | `payouts/rules.ts` `assertNamesAField` / `assertWaivable` / `assertPayout` |
| `users/service.ts` × 2 | `users/rules.ts` `assertCreditSubject` |

Two of those are worth naming individually.

**`assertBillingIdentity` answers two different kinds on purpose.** On the
customer path the SESSION has no user row, which is the caller's own standing
(403); on the admin path the request NAMED somebody who is not there, which is
the document (422). Collapsing them would have made an admin's typo look like
the admin being signed out.

**`assertWebhookMatched` throws a plain `Error`, deliberately.** D24: a webhook
that matches no row is refused so Stripe retries it. The caller is Stripe, and
500 is what makes it come back — a `DomainError` would answer 4xx and Stripe
would stop.

### The other half of the ruling: writes answer their row

`payments.details.update` returned a boolean, so `saveCheckoutPayout` wrote,
asked whether one row changed, then **read the row back** — three statements
to learn what the first already knew, with a window in which the answer could
disagree with the write it followed. It returns `DetailRow | undefined` now
(`RETURNING` the same safe projection every read uses), and the re-read is
gone:

```ts
const rewritten = existing_id ? await details.update(existing_id, values, tx) : undefined;
return rewritten ?? (await details.create(id, user_id, values, tx));
```

`setMethod`'s boolean-then-`NotFound` went the same way.

**The RETURNING list carries no envelope and no plaintext number**, and that is
asserted rather than assumed: `db/payments/details/tests/repo.test.ts` filters
the answered row's own keys for `/number|encrypt/` and fails on any. A column
added to that table cannot ride out through the write path unnoticed.

---

## 4. `GET /api/transactions/get_transactions` answered one row of a ledger

It was `rows[0]` of an unlimited ordered read, so a customer with eleven ledger
entries was told about one. It had been documented as deliberate — "a response
SHAPE that must not move during a schema migration" — and recorded for Jacob.
Ruling 44 retires that caution, the endpoint has no frontend consumer to break,
and a ledger that reports one entry is not a ledger. **It answers the list,
newest first.**

`domain/transactions/compose.ts` is deleted with it. It read the ledger rows,
collected their order ids, asked `orders.orders` for the directions in a second
statement, then re-spelled all eight fields to graft the answer on. One
`LEFT JOIN` in `by_user.sql` says the same thing, on the wire's own names
(`transaction_type`, `direction`); a ledger row with no order keeps a null
direction because the join finds nothing.

`validate:wire` covers it: `GET /transactions/get_transactions`, 11 rows, ok.

---

## 5. What else moved server-side

**The payout fee was written into the browser.** All four payout form schemas
carried a `cost` field, seeded in the step from a `payments.methods` row with a
hardcoded `?? 20` fallback for WIRE. It was neither rendered from the form (the
step shows the ROW's `flat_fee`) nor sent (the strict body would refuse it), so
it was a fee living in a schema with no reader — and the `?? 20` was a number
nobody could trace. The field is gone from all four; the step renders the row.

**`frontend/features/payouts/types.ts` restated `Payout` as a local
interface** with nothing importing it, and it carried `time_delay` — a column
of `payments.methods` that has never been part of that shape. Deleted;
`@dorado/contracts`' `Payout` and `PayoutDetails` are the shapes. What stays in
that file is the four form schemas (genuinely new data a customer types —
ruling 43's one exception) and the icon map.

---

## 6. The client package

`frontend/features/{payments,payouts,stripe,users}/queries.ts` are deleted.
Their hooks are `packages/client/src/{payments,payouts,users}/`, twelve of
them, each one endpoint, types from `@dorado/contracts` only. All four prefixes
came **off** `lint:client-boundary`'s PENDING list rather than being edited
around, so the gate can only shrink from here.

What is deliberately NOT in the client: any decision about which surface a
customer is shown. `payment_surface` is a field of the quote, so a component
reads it. Fees and surcharges on a method row are display; icons stay a
client-side map beside each selector.

`lint:input-shapes` lost `Options:PayoutOptions`, `Options:IntentOptions` and
`Options:UserOptions` from ACCEPTED — the builders take contract patches now.

---

## 7. Admin frontend — every file touched

Frozen surface, import swaps. Listed in full:

| file | change |
|---|---|
| `orders/purchaseOrders/admin/AdminPurchaseOrders.tsx` | import swap |
| `.../adminPurchaseOrderDrawerContents/AdminPaymentProcessing.tsx` | import swap |
| `.../adminPurchaseOrderDrawerContents/AdminReceived.tsx` | import swap |
| `.../adminPurchaseOrderDrawerFooter.tsx` | import swap |
| `orders/salesOrders/admin/AdminSalesOrders.tsx` | import swap |
| `orders/salesOrders/admin/queries.ts` | import swap |
| `.../adminSalesOrderDrawerContents/AdminPending.tsx` | import swap + `useGetSalesOrderPaymentIntent` → `useOrderPaymentIntent` (rename) |
| `.../adminSalesOrderDrawerContents/AdminPending.test.tsx` | the network stub moved from `apiRequest` to `fetch`, because the hooks it drives are `@dorado/client`'s and that package owns its own fetch |
| `orders/salesOrders/admin/createSalesOrder/createSalesOrderDrawer.tsx` | **more than an import swap, and unavoidable** — see below |
| `users/ui/UsersAdminTable.tsx`, `users/ui/UsersDrawer.tsx`, `leads/ui/LeadsDrawer.tsx` | import swaps |

**`createSalesOrderDrawer.tsx` is the exception.** It was sending
`shipping_service: 'STANDARD'` and `payment_method: 'CARD'` — CODES — to
`POST /api/stripe/update_payment_intent`. That endpoint's body has taken IDS
since `UpdatePaymentIntentBody` landed (ruling 43, before this lane); the old
frontend hook was resolving codes to ids privately, and moving the hook to
`@dorado/client` — where it takes the contract body directly — surfaced that
the drawer had been relying on it. The swap is two lookups against rows the
drawer already reads. An import swap alone would not have compiled, and leaving
it would have left an admin surface posting a shape the server refuses.

---

## 8. Verification

| gate | result |
|---|---|
| `pnpm check:fast` | 21 members OK; **`figma:inventory` red** — Jacob's map, not this lane |
| `pnpm --filter @dorado/api test` | **1303 passed, 1 skipped, 221 files**, exit 0 |
| `pnpm --filter @dorado/api typecheck` | exit 0 |
| `pnpm --filter @dorado/client typecheck` / `test` | exit 0 / 14 passed |
| `pnpm --filter @dorado/frontend typecheck` / `test` | exit 0 / 210 passed, 36 files |
| `pnpm --filter @dorado/api validate:wire` | **29 shapes match, 0 diverge**, 3 skipped for want of a fixture |
| `pnpm --filter @dorado/api audit:plaintext-secrets` | dev clean — 4 candidate columns, all empty |

New tests: `payments/tests/surface.test.ts` (6 — the surface rule at the
boundary, including the sub-minimum sliver), `payments/tests/instruments.test.ts`
(4 — the webhook's instrument recording, driven through the injected
`Instruments` with no provider reachable), `payouts/tests/atomicity.test.ts`
(3 — the three-table patch commits together or not at all),
`transport/orders/tests/customer-places-sale.test.ts` (3),
`packages/client/src/tests/payments.test.ts` (7).

**One flake to know about.** A mid-lane run failed seven files on
`Hook timed out in 20000ms` at `pg_advisory_unlock` — the lock contention
CLAUDE.md's Tests section describes. Nothing was asserted wrong; the identical
tree passed twice on rerun. Read the assertion, not the file count.

---

## 9. Left, deliberately

- **Production still holds 24 plaintext bank rows.** Unchanged by this lane and
  not its to change: `audit:plaintext-secrets --prod` is the measurement, and
  the clearing runs in Jacob's `pg_dump` → 071 → 073 → `encrypt:payouts` →
  verify sequence. Dev holds none, so the script seals zero here.
- **`figma:inventory`'s 7 findings** are the design-system map (`Banner`,
  `Divider`, `Drawer`, `Pagination`, `Radio` listed PENDING but built; `hooks`
  and `rating` undrawn). Not touched.
- **`domain/checkout/service.ts`'s two throws stay** — `assertRealAccount` and
  the purchase-only payout-step guard are the checkout lane's file. Ruling 65
  is being applied per lane; `assertRealAccount` is async (it reads the user
  row) so it cannot become a pure rule as it stands.
- **`lint:no-throw-in-services` is the fulfillments lane's** to add. This lane
  left its files clean for it rather than adding a second lint.
- **The frontend `payouts`/`stripe` UI directories still hold components** —
  only their `queries.ts` moved. Deleting `features/stripe` entirely waits on
  the surfaces that render its form.
