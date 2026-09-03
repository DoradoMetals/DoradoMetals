-- THE PUBLIC PROJECTION. Anyone on the internet can read this, so what it does
-- NOT contain matters as much as what it does: no display, no stock, no
-- created_by, no timestamps, no filter_category, no quantity. Those are the
-- admin list's, and tests/unit.test.ts fails if one appears here.
--
-- metal_id and mint_id ARE projected and are NOT on the wire. compose.ts needs
-- them to attach `metal_type` and `mint_name`, and drops them again. The
-- implementation this replaces joined metals.metals and products.mints to get
-- the two labels; one read of each reference table beats a join per query.
--
-- The storefront list. `display` is what makes a product public at all.
SELECT
       id, name, description, content, purity, gross,
       bid_premium, ask_premium, type,
       image_front, image_back, variant_group, shadow_offset, slug,
       legal_tender, domestic_tender, sell_display, is_generic, variant_label,
       metal_id, mint_id
  FROM products.bullion
 WHERE display = true
 ORDER BY id ASC
