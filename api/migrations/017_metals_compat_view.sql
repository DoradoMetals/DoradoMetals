-- A view that reassembles exchange.metals' shape from the split tables.
--
-- exchange.metals is the only migration so far that splits one table into two:
-- metals.metals holds identity, spots.spots holds the live quote. That breaks
-- verify:parity, which compares table pairs by id and correctly reports the
-- quote columns as having no home in metals.metals.
--
-- Suppressing that warning would defeat the check. This instead gives it
-- something real to compare against: a view with exactly the columns and names
-- exchange.metals has, assembled from where they now live. If the split ever
-- loses a value, the parity check sees it.
--
-- The view is also the clearest statement of what the split did, and it gives
-- anything still reading the old shape a target during the transition.
--
-- scrap_percentage and bullion_percentage are absent. They exist on
-- exchange.metals, nothing reads them, and rate tiering comes from rates.rates.
-- verify:parity records them as intentionally dropped rather than having this
-- view pretend to carry them as NULL, which would report every row as differing.

CREATE VIEW metals.exchange_compat AS
SELECT
  m.id,
  m.name           AS type,
  s.ask            AS ask_spot,
  s.bid            AS bid_spot,
  s.percent_change,
  s.dollar_change
FROM metals.metals m
LEFT JOIN spots.spots s ON s.metal_id = m.id;
