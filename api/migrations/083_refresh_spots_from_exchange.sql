-- Bring spots.spots back up to date with exchange.metals.
--
-- WHY THIS IS NEEDED NOW. The spot cron wrote exchange.metals only, because
-- SPOTS_SOURCE was unset and the dual repo was never selected. spots.spots has
-- therefore been frozen since it was first backfilled, and verify:parity has
-- been reporting the gap for a while as the one NOT SAFE pair: four metals
-- differing on ask, bid and percent_change, gold by about $290.
--
-- That was harmless while nothing read spots.spots. The spots feature now reads
-- it, and a stale spot prices every scrap line wrong - so the catch-up has to
-- happen with the read pivot, not after the next cron tick.
--
-- From here on the service writes both schemas in one transaction, so this is a
-- one-time catch-up rather than something that will be needed again.
--
-- IDEMPOTENT and additive: an upsert keyed on metal_id, taking exchange's
-- values. It cannot lose a quote - the worst it can do is write the value
-- exchange already holds.
INSERT INTO spots.spots (metal_id, ask, bid, dollar_change, percent_change)
SELECT e.type, e.ask_spot, e.bid_spot, e.dollar_change, e.percent_change
  FROM exchange.metals e
ON CONFLICT (metal_id) DO UPDATE SET
  ask            = EXCLUDED.ask,
  bid            = EXCLUDED.bid,
  dollar_change  = EXCLUDED.dollar_change,
  percent_change = EXCLUDED.percent_change,
  updated_at     = now();
