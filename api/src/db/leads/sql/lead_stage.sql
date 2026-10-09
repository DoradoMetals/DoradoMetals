-- The lead's one label, derived from the three MOMENTS migration 251 put on
-- the row (statuses.md CRM section). converted wins, then responded, then
-- contacted; a lead with none of the three is New. No table alias assumed, so
-- this substitutes into a plain SELECT and into an UPDATE ... RETURNING alike.
--
-- The three booleans the derivation used to read are still on the table and
-- still in step - public.lead_stage_stamp() keeps the pair together until a
-- later wave drops them - so this reads the fact rather than the mirror.
CASE
  WHEN converted_at IS NOT NULL THEN 'Converted'
  WHEN responded_at IS NOT NULL THEN 'Responded'
  WHEN contacted_at IS NOT NULL THEN 'Contacted'
  ELSE 'New'
END
