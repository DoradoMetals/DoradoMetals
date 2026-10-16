-- A FINALIZED ORDER HOLDS AN OPENING LOCK EVENT FOR EVERY FROZEN METAL.
--
-- Migration 285 and the spot-lock rule (ruling 2026-10-14, ruling 131) refuse
-- a money read for a metal with no lock. An order finalized before lock events
-- existed, or before 243's backfill reached a metal, can hold a frozen
-- orders.spots row with no event for that metal, and then its documents and
-- totals are refused. Order #193 on the local test database is one such case.
--
-- THE EVENT IS THE OPENING LOCK, derived as 243 derived it: the frozen bid and
-- ask from the order's own orders.spots row, dated at finalize (the
-- orders.transactions row's updated_at, falling back to its created_at) and
-- attributed to whoever finalized it. Nothing is re-read from the feed.
--
-- GUARDED BY NOT EXISTS per order and metal, limited to orders that are
-- locked with a total (finalized) and a frozen bid, AND TO THE METALS THE ORDER
-- HOLDS (orders.lots -> inventory.lots), so a re-run adds nothing and no event
-- is written for a metal the order no longer holds (ruling 2026-10-14).
--
-- CORRECTED IN PLACE on 2026-10-16, before production ever ran it: the first
-- form lacked the orders.lots join. Dev had applied it with 0 rows, so dev is
-- unchanged; its stored checksum was reconciled. 294 is the same statement and
-- stays as a second idempotent pass.
--
-- Counted read-only on dev before writing (2026-10-16): 0 rows. It is kept for
-- production, which has not been checked; FOLLOWUPS carries the production-day
-- line.
--
-- Purely additive: rows appended to orders.spot_locks. `exchange` is neither
-- read nor written.

INSERT INTO orders.spot_locks (order_id, metal_id, action, bid, ask, reason,
                               created_at, updated_at, created_by_id)
SELECT os.order_id, os.metal_id, 'lock', os.bid, os.ask, 'opening lock at finalize',
       COALESCE(t.updated_at, t.created_at, o.updated_at, now()),
       COALESCE(t.updated_at, t.created_at, o.updated_at, now()),
       COALESCE(t.updated_by_id, o.updated_by_id)
  FROM orders.spots os
  JOIN orders.orders o ON o.id = os.order_id
  JOIN orders.transactions t ON t.order_id = o.id
 WHERE o.spots_locked IS TRUE
   AND t.total IS NOT NULL
   AND os.bid IS NOT NULL
   AND os.metal_id IN (SELECT li.metal_id
                         FROM orders.lots ol
                         JOIN inventory.lots li ON li.id = ol.lot_id
                        WHERE ol.order_id = os.order_id)
   AND NOT EXISTS (SELECT 1 FROM orders.spot_locks el
                    WHERE el.order_id = os.order_id
                      AND el.metal_id = os.metal_id);
