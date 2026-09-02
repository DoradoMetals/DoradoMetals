-- THE LAST BODY FIELDS BECOME ROW COLUMNS (D210 - Jacob: "we don't want a
-- body being sent with details at order creation time, just ids that the
-- server will use to pull resources").
--
-- The parcel's weight and insured value are the customer's inputs, recorded
-- when they make them; the carrier-pickup slot is the date and time the
-- customer asked FedEx to come. All three lived on the create body until now.
-- pickup_date and pickup_time are TEXT on purpose: they are the provider's
-- own strings, combined into a timestamp inside Postgres where needed - the
-- same no-JavaScript-date rule the legacy pickup statement documents.
ALTER TABLE checkout.checkouts
  ADD COLUMN IF NOT EXISTS package_weight numeric,
  ADD COLUMN IF NOT EXISTS declared_value numeric,
  ADD COLUMN IF NOT EXISTS pickup_date text,
  ADD COLUMN IF NOT EXISTS pickup_time text;
