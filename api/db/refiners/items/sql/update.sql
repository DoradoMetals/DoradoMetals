-- ONE COLLAPSE (D212's CRUD ruling): replaces set_assay.sql and
-- set_premium.sql, which were the same UPDATE against the same table under
-- two names - the assay report (what the refinery says came back once the
-- metal was melted) and the refinery's own per-line premium.
--
-- content is COMPUTED BY THE CALLER, same rule as
-- orders/items/sql/update_scrap.sql: the unit conversion is a JavaScript
-- table, and two definitions of content would drift.
UPDATE refiners.items
   SET pre_melt = COALESCE($1, pre_melt),
       post_melt = COALESCE($2, post_melt),
       purity = COALESCE($3, purity),
       content = COALESCE($4, content),
       premium = COALESCE($5, premium)
 WHERE order_item_id = $6
