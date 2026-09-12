-- The lead's one label, derived from its three independent booleans
-- (statuses.md CRM section). converted wins, then responded, then contacted;
-- a lead with none of the three is New. No table alias assumed, so this
-- substitutes into a plain SELECT and into an UPDATE ... RETURNING alike.
CASE
  WHEN converted THEN 'Converted'
  WHEN responded THEN 'Responded'
  WHEN contacted THEN 'Contacted'
  ELSE 'New'
END
