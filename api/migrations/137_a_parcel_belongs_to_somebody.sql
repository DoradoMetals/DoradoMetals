-- FINDING 3 OF THE 2026-09-07 API REVIEW, THE HALF THE DATABASE HAS TO KEEP.
--
-- 123 gave checkout.checkouts a composite foreign key per address column -
-- (user_id, <address column>) -> places.user_addresses (user_id, address_id) -
-- so Postgres, not a loop in TypeScript, refused an address that was not the
-- row owner's. 128 then MOVED those columns onto shipping.shipments and
-- fulfillments.pickups, and the key could not move with them: 128's own header
-- says a fulfillment row makes "no statement about the CHECKOUT's owner",
-- because neither table carried a user column. So the guarantee was lost, and
-- a customer could point their parcel at any address row in the database.
--
-- Lane C restored the RULE - logistics/fulfillments/service.ts proves the
-- address is the fulfillment owner's before writing it - and said the KEY was
-- a schema decision for Jacob. He has taken it. The column is denormalised
-- onto the two logistics tables on purpose: it is the only way a foreign key
-- can say "this address is in THIS row's owner's book", and a rule that lives
-- only in one service holds only for callers that remember to run it.
--
-- WHO THE OWNER IS, and it is read from the rows rather than from a caller:
-- the checkout that points at the draft fulfillment, else the order the
-- attached fulfillment belongs to. That is exactly what
-- `fulfillments/service.ts ownerOf()` reads, so the column and the rule agree
-- by construction.
--
-- MATCH SIMPLE, WHICH IS WHY THE BACKFILL MATTERS. A NULL user_id satisfies a
-- composite key whatever the address column holds, so a column that is added
-- and never written buys nothing. The code writes it from now on
-- (`claimOwner` on both repos, called by patchChoices before the address is
-- written); this file writes it for the rows that already exist.
--
-- THE BACKFILL IS DELIBERATELY CONSERVATIVE. It fills user_id only where every
-- address the row already carries resolves in that owner's book, so the keys
-- below can be added VALID without a scan that could fail on history. A row
-- left NULL is one whose address was never in the owner's book - an old
-- snapshot, or an address entered by an admin - and this migration does not
-- retro-judge it. Nothing is deleted and no value is overwritten.
--
-- ON DELETE SET NULL takes a column list (Postgres 15+, and dev and local are
-- 16), so deleting a book entry clears ONLY the address column. Without the
-- list Postgres would try to null user_id as well and the delete would fail
-- with a confusing error instead of doing the obvious thing - the same
-- reasoning 123 wrote down.
--
-- exchange is neither read nor written here.

-- ------------------------------------------------------------- 1. the column

ALTER TABLE shipping.shipments   ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE fulfillments.pickups ADD COLUMN IF NOT EXISTS user_id uuid;

-- ----------------------------------------------------------- 2. the backfill

WITH owner AS (
  SELECT fs.shipment_id,
         COALESCE(c.user_id, o.user_id) AS user_id
    FROM fulfillments.shipments fs
    JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
    LEFT JOIN checkout.checkouts c ON c.fulfillment_id = f.id
    LEFT JOIN orders.orders o ON o.id = f.order_id
)
UPDATE shipping.shipments s
   SET user_id = owner.user_id
  FROM owner
 WHERE owner.shipment_id = s.id
   AND owner.user_id IS NOT NULL
   AND s.user_id IS NULL
   AND (s.shipper_address_id IS NULL OR EXISTS (
         SELECT 1 FROM places.user_addresses ua
          WHERE ua.user_id = owner.user_id AND ua.address_id = s.shipper_address_id))
   AND (s.recipient_address_id IS NULL OR EXISTS (
         SELECT 1 FROM places.user_addresses ua
          WHERE ua.user_id = owner.user_id AND ua.address_id = s.recipient_address_id));

WITH owner AS (
  SELECT p.id AS pickup_id,
         COALESCE(c.user_id, o.user_id) AS user_id
    FROM fulfillments.pickups p
    JOIN fulfillments.fulfillments f ON f.id = p.fulfillment_id
    LEFT JOIN checkout.checkouts c ON c.fulfillment_id = f.id
    LEFT JOIN orders.orders o ON o.id = f.order_id
)
UPDATE fulfillments.pickups p
   SET user_id = owner.user_id
  FROM owner
 WHERE owner.pickup_id = p.id
   AND owner.user_id IS NOT NULL
   AND p.user_id IS NULL
   AND (p.pickup_address_id IS NULL OR EXISTS (
         SELECT 1 FROM places.user_addresses ua
          WHERE ua.user_id = owner.user_id AND ua.address_id = p.pickup_address_id));

-- ---------------------------------------------------------------- 3. the key

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shipments_shipper_address_theirs_fk'
  ) THEN
    ALTER TABLE shipping.shipments
      ADD CONSTRAINT shipments_shipper_address_theirs_fk
      FOREIGN KEY (user_id, shipper_address_id)
      REFERENCES places.user_addresses (user_id, address_id)
      ON DELETE SET NULL (shipper_address_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shipments_recipient_address_theirs_fk'
  ) THEN
    ALTER TABLE shipping.shipments
      ADD CONSTRAINT shipments_recipient_address_theirs_fk
      FOREIGN KEY (user_id, recipient_address_id)
      REFERENCES places.user_addresses (user_id, address_id)
      ON DELETE SET NULL (recipient_address_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pickups_pickup_address_theirs_fk'
  ) THEN
    ALTER TABLE fulfillments.pickups
      ADD CONSTRAINT pickups_pickup_address_theirs_fk
      FOREIGN KEY (user_id, pickup_address_id)
      REFERENCES places.user_addresses (user_id, address_id)
      ON DELETE SET NULL (pickup_address_id);
  END IF;
END $$;

-- The referencing side of each key wants its own index: deleting a book entry
-- has to find the rows to clear.
CREATE INDEX IF NOT EXISTS shipments_user_shipper_address_idx
  ON shipping.shipments (user_id, shipper_address_id);
CREATE INDEX IF NOT EXISTS shipments_user_recipient_address_idx
  ON shipping.shipments (user_id, recipient_address_id);
CREATE INDEX IF NOT EXISTS pickups_user_pickup_address_idx
  ON fulfillments.pickups (user_id, pickup_address_id);
