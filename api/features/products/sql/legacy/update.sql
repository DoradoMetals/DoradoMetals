-- Mirror of sql/update.sql, same parameter order, exchange's column names for
-- the three that were renamed: product_name, product_description, product_type.
--
-- exchange's UPDATE did not maintain updated_at and this does not either -
-- adding it would make every mirrored row's timestamp disagree with the one the
-- backfill copied, and verify:parity compares them.
UPDATE exchange.products
   SET metal_id = $1,
       supplier_id = $2,
       product_name = $3,
       product_description = $4,
       bid_premium = $5,
       ask_premium = $6,
       product_type = $7,
       display = $8,
       content = $9,
       gross = $10,
       purity = $11,
       mint_id = $12,
       variant_group = $13,
       shadow_offset = $14,
       stock = $15,
       updated_by = $16,
       slug = $17,
       homepage_display = $18,
       legal_tender = $19,
       domestic_tender = $20,
       sell_display = $21,
       is_generic = $22,
       variant_label = $23,
       quantity = $24,
       image_front = $25,
       image_back = $26,
       filter_category = $27
 WHERE id = $28
RETURNING id
