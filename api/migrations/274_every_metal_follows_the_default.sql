-- EVERY METAL FOLLOWS THE DEFAULT SOURCE.
--
-- docs/model/spots-history.md, Resolution: "The four override rows seeded by
-- migration 240 are deleted so every metal follows the default." Migration
-- 240 wrote one spots.active_sources row per metal naming nfusion, with no
-- actor; migration 267 made those rows overrides, so a change of default
-- moved none of them.
--
-- Only those seeded rows go: a row naming nfusion that no admin ever wrote
-- (no actor on either side). A row an admin set is a decision and stays.
--
-- `exchange` is neither read nor written.

DELETE FROM spots.active_sources a
 WHERE a.source_id = 'nfusion'
   AND a.created_by_id IS NULL
   AND a.updated_by_id IS NULL
   AND a.created_by = ''
   AND a.updated_by = '';
