-- The order's activity (ruling 148): who placed, locked, paid, sent and
-- settled, read from facts that are already stored. No history table backs it;
-- each branch is one stamp or event row. The actor is an id, never a name
-- (ruling 127); a fact whose table records no actor reads NULL. Order stamps
-- are last-writer only, so `order_updated` is the latest edit, not each one.
-- $1 is the order id, $2 the page size, $3 an optional `before` cursor on `at`.
WITH batched AS (
  SELECT DISTINCT ro.id, ro.sent_at, ro.settled_at
    FROM orders.lots ol
    JOIN inventory.lot_sources ls ON ls.source_lot_id = ol.lot_id AND ls.kind = 'batch'
    JOIN refining.lots rl ON rl.lot_id = ls.lot_id
    JOIN refining.orders ro ON ro.id = rl.refining_order_id
   WHERE ol.order_id = $1::uuid
),
facts AS (
  SELECT o.created_at AS at, 'order_created' AS kind, o.created_by_id AS actor_id,
         o.id AS subject_id, NULL::jsonb AS detail
    FROM orders.orders o
   WHERE o.id = $1::uuid AND o.created_at IS NOT NULL
  UNION ALL
  SELECT o.updated_at, 'order_updated', o.updated_by_id, o.id, NULL
    FROM orders.orders o
   WHERE o.id = $1::uuid AND o.updated_at > o.created_at
  UNION ALL
  SELECT o.cancelled_at, 'order_cancelled', NULL, o.id, NULL
    FROM orders.orders o
   WHERE o.id = $1::uuid AND o.cancelled_at IS NOT NULL
  UNION ALL
  SELECT sl.created_at,
         CASE sl.action WHEN 'lock' THEN 'spots_locked' ELSE 'spots_unlocked' END,
         sl.created_by_id, sl.id, jsonb_build_object('metal_id', sl.metal_id)
    FROM orders.spot_locks sl
   WHERE sl.order_id = $1::uuid
  UNION ALL
  SELECT t.created_at, 'transfer_created', t.created_by_id, t.id,
         jsonb_strip_nulls(jsonb_build_object('transfer_kind', t.kind, 'rail', t.rail,
                                              'state', t.state,
                                              'override_reason', t.override_reason))
    FROM payments.transfers t
   WHERE t.order_id = $1::uuid
  UNION ALL
  SELECT t.sent_at, 'transfer_sent', NULL, t.id,
         jsonb_build_object('transfer_kind', t.kind, 'rail', t.rail)
    FROM payments.transfers t
   WHERE t.order_id = $1::uuid AND t.sent_at IS NOT NULL
  UNION ALL
  SELECT t.completed_at, 'transfer_completed', NULL, t.id,
         jsonb_build_object('transfer_kind', t.kind, 'rail', t.rail, 'state', t.state)
    FROM payments.transfers t
   WHERE t.order_id = $1::uuid AND t.completed_at IS NOT NULL
  UNION ALL
  SELECT te.occurred_at, 'transfer_event', NULL, te.transfer_id,
         jsonb_strip_nulls(jsonb_build_object('event_type', te.event_type,
                                              'state', te.reported_state))
    FROM payments.transfer_events te
    JOIN payments.transfers t ON t.id = te.transfer_id
   WHERE t.order_id = $1::uuid
  UNION ALL
  SELECT p.created_at, 'document_stored', p.created_by_id, p.id,
         jsonb_build_object('document_kind', p.kind)
    FROM media.pdfs p
   WHERE p.order_id = $1::uuid
  UNION ALL
  SELECT e.sent_at, 'email_sent', NULL, e.id,
         jsonb_build_object('document_kind', p.kind, 'email_kind', e.kind,
                            'email_status', e.status)
    FROM media.emails e
    JOIN media.pdfs p ON p.id = e.pdf_id
   WHERE p.order_id = $1::uuid OR e.order_id = $1::uuid
  UNION ALL
  SELECT b.sent_at, 'refiner_sent', NULL, b.id, NULL
    FROM batched b
   WHERE b.sent_at IS NOT NULL
  UNION ALL
  SELECT b.settled_at, 'refiner_settled', NULL, b.id, NULL
    FROM batched b
   WHERE b.settled_at IS NOT NULL
  UNION ALL
  SELECT a.arrived_at, 'arrived', NULL, a.fulfillment_id, NULL
    FROM fulfillments.arrivals a
   WHERE a.order_id = $1::uuid AND a.arrived AND a.arrived_at IS NOT NULL
)
SELECT to_char(f.at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at,
       f.kind, f.actor_id, f.subject_id, f.detail
  FROM facts f
 WHERE $3::timestamptz IS NULL OR f.at < $3::timestamptz
 ORDER BY f.at DESC, f.kind, f.subject_id
 LIMIT $2::int
