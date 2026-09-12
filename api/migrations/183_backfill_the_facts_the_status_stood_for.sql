-- 181 dropped `orders.orders.status` and the order's label is derived from
-- facts instead. Measured on the production-shaped copy `chain6` BEFORE the
-- drop, three facts the legacy status stood for had no row anywhere, and the
-- derivation therefore read 57 of 72 legacy orders as unfinished:
--
--   19 purchase orders exchange calls Completed derived `Awaiting Receipt` -
--      nothing recorded that the parcel arrived. That half is 184's, which also
--      drops the column this file first used for it;
--   32 purchase orders exchange calls Completed derived `Ready to Pay` -
--      `payments.transfers` is EMPTY on a production-shaped database and
--      `exchange.payouts` records where to pay, never that we paid;
--    6 sales orders exchange calls Completed derived `In Transit` - the
--      outbound parcel carries no delivered_at.
--
-- The fix belongs in the backfill that derives those facts, not in a stored
-- label. `exchange.purchase_orders.purchase_order_status` and
-- `exchange.sales_orders.sales_order_status` are the only evidence the business
-- has that these things happened, and they are READ here - never written.
--
-- The payout rows matter for more than a label: without them every completed
-- legacy order offers `Send payment`, and an admin acting on that offer pays a
-- customer twice. They are minted with `provider = 'legacy'` and no
-- `provider_ref`, so nothing reconciles them against a rail.
--
-- An order paid into a Dorado balance is NOT a transfer - it is the
-- `payments.ledger` Credit row 061 backfills - so those are skipped, and so is
-- any order that already carries one.
--
-- Idempotent throughout: every statement is guarded on the fact being absent.
-- `exchange` is read and never written.

UPDATE shipping.shipments s
   SET delivered_at = COALESCE(s.delivered_at, o.updated_at, o.created_at, now())
  FROM fulfillments.shipments fs
  JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
  JOIN orders.orders o ON o.id = f.order_id
  JOIN exchange.sales_orders so ON so.id = o.id
 WHERE fs.shipment_id = s.id
   AND s.delivered_at IS NULL
   AND s.direction = 'Outbound'
   AND o.direction = 'sale'
   AND so.sales_order_status = 'Completed';

INSERT INTO payments.transfers
       (order_id, kind, rail, state, amount, counterparty_user_id, details_id,
        provider, reference, sent_at, completed_at)
SELECT o.id,
       'payout'::payments.transfer_kind,
       (CASE m.type WHEN 'WIRE' THEN 'WIRE' ELSE 'ACH' END)::payments.rail,
       'Sent'::payments.transfer_state,
       t.total,
       o.user_id,
       t.payout_details_id,
       'legacy',
       'PO-' || o.number,
       COALESCE(o.updated_at, o.created_at, now()),
       COALESCE(o.updated_at, o.created_at, now())
  FROM orders.orders o
  JOIN exchange.purchase_orders p ON p.id = o.id
  JOIN orders.transactions t ON t.order_id = o.id
  LEFT JOIN payments.details d ON d.id = t.payout_details_id
  LEFT JOIN payments.methods m ON m.id = d.method_id
 WHERE o.direction = 'purchase'
   AND p.purchase_order_status = 'Completed'
   AND t.total IS NOT NULL
   AND COALESCE(m.type, '') <> 'DORADO_ACCOUNT'
   AND NOT EXISTS (SELECT 1 FROM payments.ledger l
                    WHERE l.order_id = o.id AND l.type = 'Credit')
   AND NOT EXISTS (SELECT 1 FROM payments.transfers tr
                    WHERE tr.order_id = o.id AND tr.kind = 'payout');

DO $$
DECLARE
  delivered bigint;
  paid bigint;
BEGIN
  SELECT count(*) INTO delivered FROM shipping.shipments
   WHERE direction = 'Outbound' AND delivered_at IS NOT NULL;
  SELECT count(*) INTO paid FROM payments.transfers WHERE kind = 'payout' AND provider = 'legacy';
  RAISE NOTICE 'facts: % outbound parcel(s) delivered, % legacy payout(s) recorded as Sent',
    delivered, paid;
END $$;
