-- When the order closed (ruling 134), as one expression over the orders.orders
-- row `o` and its derived state, which the caller substitutes for
-- /*__state__*/ (list.sql already holds it; view.sql substitutes
-- order_state.sql). NULL until the state reads Completed.
--
-- A purchase closes when the customer is paid: the latest of its Sent or
-- Received payouts and its balance credits, which together reached the total.
-- A sale closes when it is paid for and delivered: the latest of its received
-- charge and its outbound delivery. The order's own updated_at stands in only
-- when neither fact carries a time (a pickup closed by fulfillment status).
CASE WHEN (/*__state__*/) = 'Completed' THEN
  CASE WHEN o.direction = 'purchase' THEN
    COALESCE(
      GREATEST(
        (SELECT max(COALESCE(t.completed_at, t.sent_at, t.updated_at))
           FROM payments.transfers t
          WHERE t.order_id = o.id AND t.kind = 'payout' AND t.state IN ('Sent', 'Received')),
        (SELECT max(l.occurred_at) FROM payments.ledger l
          WHERE l.order_id = o.id AND l.type = 'Credit')),
      o.updated_at)
  ELSE
    COALESCE(
      GREATEST(
        (SELECT max(COALESCE(t.completed_at, t.updated_at))
           FROM payments.transfers t
          WHERE t.order_id = o.id AND t.kind = 'charge' AND t.state = 'Received'),
        (SELECT max(s.delivered_at)
           FROM fulfillments.fulfillments f
           JOIN fulfillments.shipments fs ON fs.fulfillment_id = f.id
           JOIN shipping.shipments s ON s.id = fs.shipment_id
          WHERE f.order_id = o.id AND s.direction = 'Outbound')),
      o.updated_at)
  END
END
