# The rails-to-lots seam

Executed on `seam-lane`, 2026-09-12. Nothing committed.

A refiner order's payment state already lived on `payments.transfers`, keyed by
`refining_order_id` (payment-rails.md / lot-model.md): `POST /api/payments/payouts`
and `/charges` already accepted `refining_order_id`, `refining.order_money`
already derived the amount, and `GET /api/refining/orders/:id/payment` already
answered a `PaymentView`. What the refiner order's own read and rules never did
was look at any of it, so the refiner order screen had no payment actions of its
own. This wave closes that seam - no migration, no new table, no new route
group. Everything needed already existed except the read and the one write
`mark_received` that genuinely did not.

## 1. `RefiningOrderView.payment`

`payment: PaymentView | null` is now embedded in the SQL read itself
(`api/src/db/refining/orders/sql/view_one.sql` and `view_all.sql`, kept in
lockstep by hand the way the rest of the file already is per ruling 71), not
composed in TypeScript from a second query. A `LEFT JOIN LATERAL` picks the
latest non-`Failed` transfer for the order the same way `payment_view_refining.sql`
already does, and `amount_due` is `refining.order_money.total` - the same
derived total the standalone endpoint already answered, never stored.

`payment` is `NULL` for exactly one case: `direction = 'sell' AND
settlement_type = 'pooled'`. That order's value settles through
`inventory.pool` locks, not a transfer, and no charge is ever opened for it.
Every other order - `buy` unconditionally, `sell` with `settlement_type =
'paid'` - always carries a `payment` object, with every transfer field `null`
until one is opened, the same way `PaymentView` already answers for a customer
order with no payment row yet.

The standalone `GET /api/refining/orders/:id/payment` is untouched and still
answers the same shape; the embed just means the order screen no longer needs
a second round trip to decide which payment buttons to show.

## 2. Three actions, classified per ruling 112

`RefiningOrderView.actions` gains `send_payment`, `request_payment`,
`mark_received` (`api/src/domains/refining/rules.ts`):

| action | direction | offered when | confirm | override |
|---|---|---|---|---|
| `send_payment` | `buy` | order not cancelled | sending before `settled_at` - `sendPaymentConfirm` | a standing `Processing`/`Sent` payout - `sendPaymentOverride` |
| `request_payment` | `sell`, payment not null | `payment.state` is `null` or `Due` | - | - |
| `mark_received` | `sell`, payment not null | a transfer exists (`transfer_id` set) and is not yet `Received` | - | - |

`send_payment` is offered whether or not a payout has been opened yet, the
same way the customer order's own `send_payment` is - the frontend opens
(idempotent) then sends. Its override is the exact mechanism customer orders
use: `POST /api/payments/payouts/:id/send` refuses a second send with 409
unless the body carries `override_reason` (>= 10 chars) AND the session
stepped up in the last five minutes. Nothing about that mechanism changed;
`sendPaymentOverride` only decides whether the ACTION advertises it.

None of the three are gated on `settled_at` being null - paying (or being
paid) normally happens AFTER settlement, and "before settlement" is the
confirm case, not a block.

## 3. `mark_received` - the one genuinely new write

Nothing previously moved a charge to `Received` by hand; the only paths were a
Moov webhook or the customer inbound-matching flow. Refiners are paid by wire
outside Moov as often as customers are, so charges gained the same manual
close-out a payout already had in `mark_sent`:

- `ChargePatch` gains an optional `reference` beside `failure_reason`
  (`packages/contracts/src/payments/transfers.ts`), partial + strict, exactly
  the shape `PayoutPatch` already has.
- `charges/rules.ts` (new) - `assertNamesExactlyOneField`, the same one-field
  guard `payouts/rules.ts` already enforces.
- `charges/service.ts` gains `markReceived` (mirrors `payouts.markSent`:
  stamps `provider = 'manual'`, `provider_ref`/`reference`, then
  `rails.moveState(..., 'Received', null, tx)`) and `patchCharge`, the
  dispatcher `PATCH /api/payments/charges/:id` now calls: `reference` ->
  `markReceived`, `failure_reason` -> `failCharge` (unchanged), no route added.
- Re-marking an already-`Received` charge is refused: `moveState` finds
  `Received -> Received` does not move forward and `assertWritten` throws.

No provider call, no side effect outside the row - ruling 114's PATCH-on-a-
generic-update shape, guarded in `rules.ts`.

## 4. Tests

- `api/src/domains/refining/tests/payment-actions.test.ts` (new) - a `buy`
  order's `send_payment` confirmed before settlement and overridden (409, no
  reason) once a payout is `Sent`; a `sell` + `paid` order's `request_payment`
  -> `mark_received` lifecycle through to `Received`, with both actions gone
  once received; the pooled case: `payment` is `null` and none of the three
  actions are offered.
- `api/src/domains/transactions/charges/tests/mark-received.test.ts` (new) -
  `markReceived` moves `Due` straight to `Received`; re-marking is refused;
  marking a payout (`assertKind`) is refused; `patchCharge`'s one-field guard
  (zero fields, both fields, each field alone).
- `api/src/domains/refining/tests/screens.test.ts` and the wider transactions
  suite were re-run unchanged and stay green.

### Unrelated fix carried in this lane

`api/src/domains/inventory/tests/http.test.ts`'s two "never leaks into the
summary" tests asserted `on_hand_content < 999` - a bound calibrated to dev's
few rows, which a production-shaped database (2,642 oz of silver already on
hand) breaks even though nothing is wrong. Both now snapshot the metal's
`on_hand_content` before seeding, add one known on-hand control lot beside the
excluded (refiner / sale) lot, and assert the summary moved by exactly the
control lot's own `content` - never a magic absolute bound, and correct
regardless of what else is already on hand.

## 5. Shape changes, for the frontend pass

| shape | change |
|---|---|
| `RefiningOrderView` | gains `payment: PaymentView \| null` |
| `RefiningOrderRead.actions` | gains `send_payment` (`buy`), `request_payment` and `mark_received` (`sell`, not pooled) |
| `ChargePatch` | was `{ failure_reason }`; is now `{ reference?, failure_reason? }` partial, dispatched the same way `PayoutPatch` already is |

No route changed shape or URL. `GET /api/refining/orders/:id/payment` is
unchanged and still usable on its own.
