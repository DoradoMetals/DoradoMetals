-- The admin product form, which sends the whole product back.
--
-- metal_id, mint_id and supplier_id ARE IDS HERE. The statement this replaces
-- took NAMES and resolved each with a scalar subquery -
-- `metal_id = (SELECT id FROM metals.metals WHERE name = $1)` - three
-- sub-selects against three other tables inside one UPDATE. A name that matched
-- nothing resolved to NULL and the write failed on a NOT NULL column with no
-- indication of which of the three was wrong. The service resolves them now and
-- says which one it could not find.
UPDATE products.bullion
   SET metal_id = $1,
       supplier_id = $2,
       name = $3,
       description = $4,
       bid_premium = $5,
       ask_premium = $6,
       type = $7,
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
       filter_category = $27,
       updated_at = NOW()
 WHERE id = $28
RETURNING id
