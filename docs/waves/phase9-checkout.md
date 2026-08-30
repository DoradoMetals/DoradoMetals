# Phase 9 — checkout, properly (create-then-charge)

Taken 2026-08-30. Jacob: *"go for phase 9."* Recorded before the diff, so the
implementation can be reviewed against the intent (the D179 discipline).

## The defect this exists to remove

The sales-order checkout charges Stripe FIRST and creates the order SECOND:

```
1. stripe.confirmPayment(...)        <- the customer's money is gone
2. POST /sales_orders/create_sales_order
```

Anything failing between the two — a parse, a network drop, a deploy, a closed
laptop — leaves a **paid customer with no order**. D179 traced both failure
modes; the try/catch and `paidButNoOrder` message it added are band-aids on the
ordering, not a fix of it. Production's $126.48 of unrecorded Stripe money
(audit:payments) shows the adjacent failure — webhooks that never landed — is
real, not theoretical.

**The window that softens the risk**: the customer buy flow is OFF —
`create_sales_order` has been `requireAdmin` since Aug 26, "until the refactor
lands". This is that refactor, being built on a closed surface. Reopening is
Jacob's one-word change (`requireAdmin` → `requireUser`) and is NOT made here.

## The flow after

```
1. Intent opened and priced server-side during checkout      (unchanged)
2. POST create_sales_order                                    (NEW ORDER OF EVENTS)
     server VERIFIES the intent: it exists, it belongs to this
     session's user, its amount equals the server-priced charge
     in cents, and it is in a confirmable state
     order is created; credit is reserved; intent attached
     -> nothing has been charged yet
3. stripe.confirmPayment(...)                                 (money moves LAST)
     failure here = an order awaiting payment, retryable;
     nothing is lost in either direction
4. webhook payment_intent.succeeded
     -> updates the intent row (existing behaviour)
     -> NEW: advances the linked sales order Pending -> Preparing,
        idempotently, in both schemas
5. reconcile:payments                                         (the safety net)
     a. succeeded intents whose order is still awaiting -> advance
        (the missed-webhook case, which production has already had)
     b. awaiting orders past a TTL whose intent was never confirmed
        -> cancel + refund reserved credit, with a ledger entry
```

## Decisions, each with its reason

- **The initial label derives from a MONEY FACT, not the method string.**
  `post_charges_amount > 0` → "Pending" (awaiting payment); `=== 0` →
  "Preparing". Replaces `payment_method === "CREDIT"`, and fixes the edge it
  got wrong: an order fully covered by `using_funds` has nothing to await and
  was still born "Pending".
- **"Pending" comes to mean awaiting payment.** Today it means paid-awaiting-
  fulfilment, because orders are only created after the charge. The webhook
  advances real payments within seconds, so steady-state "Pending" = unpaid.
  Admin-facing meaning shift, flagged for Jacob; the flow is closed while it
  lands.
- **Statuses-are-labels law**: the advance is TRIGGERED by the payment fact
  (intent succeeded). Its `WHERE status='Pending' AND direction='sale'` is
  write-safety — a webhook retry must not clobber a label an admin has since
  set (Cancelled, most importantly) — not business logic branching on a label.
  The tension is named in the code comment.
- **Amount verification closes the forged-intent hole**: creation previously
  attached any `payment_intent_id` the body named, unverified. Now the intent
  must belong to the session's user and match the server-priced amount to the
  cent. This is what makes reopening the route survivable.
- **The $10 floor dies as a consequence, not a patch** (D199). Verification
  would refuse every sub-$10 balance the floor inflated, so the floor cannot
  stay. Pricing caps applied credit so the card remainder is either 0 or
  ≥ Stripe's $0.50 minimum, and `updatePaymentIntent` asserts ≥ 50 instead of
  flooring to 1000.
- **Credit is reserved at creation, refunded on reconciliation-cancel.**
  Debiting at creation keeps the ledger transactional; the cancel path
  re-credits with its own ledger entry. There is no sales-direction cancel op
  today (the PATCH `cancel` is purchase-only) — the reconciler owns this
  narrow one.
- **The cart clears when payment SETTLES, not at creation — the design above
  said otherwise and implementation proved it wrong.** The payment element is
  mounted by `clientSecret && data.address && cardNeeded`, so clearing the
  stores at creation unmounts it mid-flow and the confirm never runs. The
  double-order risk that wording worried about is handled server-side instead:
  a customer whose intent is still attached to their own Pending sale has that
  order **superseded** on the next attempt — cancelled through the
  reconciler's own helper, credit refunded with a ledger entry, intent
  detached — rather than being refused until the sweep's TTL clears it.
  Anything else attached (a paid order, a purchase, somebody else's) still
  refuses with 409.
- **The flow was ALSO just broken, which is presumably why it was closed.**
  `insertLines` resolved a line's metal from `item.metal_id` — a field
  `compose.storefront()` destructures out of the row at runtime — so every
  order built from the storefront projection 422ed. The resolver now falls
  back to `idByName` (built two lines up, previously used only for the spots).

## Not in scope tonight

Reopening the route (Jacob's); `AdminStripeForm` reordering (same shape, same
treatment, separate pass — D179 step 4); the checkout SOURCE pivot (after this
flow settles); phase 9 task 2 beyond what falls out naturally.
