-- LD F5 and LD F10, from the 2026-09-07 API review.
--
-- TWO ADDITIVE CHANGES. Nothing is dropped, nothing is rewritten, and no
-- exchange object is named.
--
-- 1. ONE SHIPMENT PER TRACKING NUMBER.
--
--    `logistics/shipping/labels.ts` read a shipment on the pool, asserted it had
--    no tracking number, and then called FedEx. There was no transaction, no
--    row lock and no constraint, so two concurrent
--    `POST /api/shipments/:id/label` calls both passed the check and both
--    bought - and `buyReturnLabel` had no check at all, so a second
--    `orders.cancel` bought a second return label and overwrote the first,
--    orphaning a label the business had already paid for.
--
--    The code now CLAIMS the row in one statement before it calls the carrier
--    (`db/shipping/shipments/sql/claim_for_label.sql`), which is what makes the
--    race impossible. This index is the second half of the same statement: the
--    database refuses to hold one carrier tracking number on two shipment rows,
--    so a label that was bought can only ever be recorded once, whatever calls
--    the recording.
--
--    PARTIAL, on purpose. Most shipments carry no tracking number - a draft's
--    shell has one from the moment the customer picks SHIPMENT - and NULLs do
--    not collide in a btree anyway; the predicate keeps the index to the rows
--    that have a number and says why in the definition. It replaces nothing:
--    `shipments_tracking_idx` is a plain index and stays, because it serves the
--    `WHERE tracking_number = $1` lookups the tracking surface makes.
--
--    IF THIS MIGRATION FAILS HERE, IT HAS FOUND THE BUG RATHER THAN CAUSED IT:
--    two shipment rows already share a tracking number, which is exactly the
--    orphaned-label state above. Do not drop the index to get past it - read
--    the two rows and decide which leg the label belongs to.
--
-- 2. A SALE'S CONFIRMATION HAS ITS OWN KIND.
--
--    `media.email_kind` had four labels and a buyer's order confirmation was
--    filed under `purchase_order_created` - the same kind as the packing list
--    that tells a customer to put their metal in a box. The email now attaches
--    the sales order invoice instead, and it needs a kind of its own to be
--    filed under. ADD VALUE is additive: every existing row keeps its label and
--    no row is rewritten.

CREATE UNIQUE INDEX IF NOT EXISTS shipments_tracking_number_unique
  ON shipping.shipments (tracking_number)
  WHERE tracking_number IS NOT NULL;

ALTER TYPE media.email_kind ADD VALUE IF NOT EXISTS 'sales_order_created';
