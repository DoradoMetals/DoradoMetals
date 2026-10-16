-- The claims and purity disputes an order carries, as one expression over the
-- orders.orders row `o`. A claim is open while Pending; a dispute is open
-- until it is resolved. Substituted into view.sql and action_facts.sql so a
-- card and the order view decide open_claim and resolve_dispute from one reading.
jsonb_build_object(
  'claims',
    (SELECT count(*)
       FROM shipping.claims c
       JOIN fulfillments.shipments fs ON fs.shipment_id = c.shipment_id
       JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
      WHERE f.order_id = o.id),
  'open_claims',
    (SELECT count(*)
       FROM shipping.claims c
       JOIN fulfillments.shipments fs ON fs.shipment_id = c.shipment_id
       JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
      WHERE f.order_id = o.id AND c.status = 'Pending'),
  'open_disputes',
    (SELECT count(*)
       FROM orders.purity_disputes d
      WHERE d.order_id = o.id AND d.resolved_at IS NULL)
)
