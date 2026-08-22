-- The orders schema cannot hold what exchange holds.
--
-- Auditing before splitting the repo turned up twenty-one columns of live,
-- populated data with nowhere to go. This is the same weakness found in nine of
-- the eleven targets before it, but much larger, and for a plain reason: the
-- January refactor stopped at three of twenty-four features, and orders was
-- never one of the three. What exists is a sketch.
--
-- The standing rule is that a schema migration never changes the wire shape.
-- That settles whether these columns are needed - the API returns every one of
-- them today - and leaves only where each belongs.
--
--   the offer's own history      -> orders.offers
--   money and fee policy         -> orders.transactions
--   order-level workflow flags   -> orders.orders
--   per-line pricing and assay   -> orders.items
--
-- One column is deliberately left out. sales_orders.shipping_service names a
-- carrier service, and shipping.shipments already has service_type for exactly
-- that; deciding whether they are the same field belongs with the shipping
-- migration, not this one. See FOLLOWUPS.
--
-- Additive only. Every column is nullable, so nothing existing is invalidated,
-- and 034 fills them from exchange. exchange is untouched.

-- The offer ---------------------------------------------------------------
--
-- offer_sent_at is when the offer went out, as against offer_expiration which
-- is when it lapses. Half the purchase orders in dev have one.

ALTER TABLE orders.offers
  ADD COLUMN IF NOT EXISTS offer_sent_at timestamptz;

-- The money ---------------------------------------------------------------
--
-- orders.transactions was built for sales orders and holds only those, but it
-- already carries refiner_fee - which is a purchase-order concept, zero on
-- every sales row - so it was always meant to serve both. The purchase side's
-- fees go here rather than into a second table:
--
--   waive_shipping_fee / waive_payout_fee   fees not charged on this order
--   shipping_paid                           whether the customer paid shipping
--   shipping_fee_actual                     what the label actually cost
--   pool_remediation / pool_oz_deducted     metal pool adjustments
--
-- And the sales side's remaining totals. base_total is the order before
-- charges; post_charges_amount and subject_to_charges_amount split what card
-- fees applied to. used_funds is the boolean beside the existing funds amount -
-- both are needed, since a zero balance applied and no balance applied are
-- different things.

ALTER TABLE orders.transactions
  ADD COLUMN IF NOT EXISTS base_total numeric,
  ADD COLUMN IF NOT EXISTS post_charges_amount numeric,
  ADD COLUMN IF NOT EXISTS subject_to_charges_amount numeric,
  ADD COLUMN IF NOT EXISTS used_funds boolean,
  ADD COLUMN IF NOT EXISTS waive_shipping_fee boolean,
  ADD COLUMN IF NOT EXISTS waive_payout_fee boolean,
  ADD COLUMN IF NOT EXISTS shipping_paid boolean,
  ADD COLUMN IF NOT EXISTS shipping_fee_actual numeric,
  ADD COLUMN IF NOT EXISTS pool_remediation numeric,
  ADD COLUMN IF NOT EXISTS pool_oz_deducted numeric;

-- The order ---------------------------------------------------------------
--
-- Workflow flags rather than money: whether the order has been sent, and
-- whether its tracking has been refreshed. Both sales-side today, but neither
-- is inherently so, and they describe the order rather than the payment.

ALTER TABLE orders.orders
  ADD COLUMN IF NOT EXISTS order_sent boolean,
  ADD COLUMN IF NOT EXISTS tracking_updated boolean;

-- The line ----------------------------------------------------------------
--
-- price is what the line settled at and is on both kinds of item.
-- refiner_premium is the premium the refiner takes, distinct from the customer
-- premium already stored.
--
-- The three actuals are the assay: what the scrap turned out to weigh and
-- assay at once melted, as against what the customer declared. Seven of twenty
-- scrap rows have them. They are admin-only - getAll passes withActuals and the
-- customer-facing lookups do not - and losing them would mean losing the record
-- of what was actually recovered from a parcel.
--
-- bid_premium is the scrap row's own premium, which is not the same column as
-- the item's premium and does not always agree with it.

ALTER TABLE orders.items
  ADD COLUMN IF NOT EXISTS price numeric,
  ADD COLUMN IF NOT EXISTS refiner_premium numeric,
  ADD COLUMN IF NOT EXISTS bid_premium numeric,
  ADD COLUMN IF NOT EXISTS purity_actual numeric,
  ADD COLUMN IF NOT EXISTS post_melt_actual numeric,
  ADD COLUMN IF NOT EXISTS content_actual numeric;
