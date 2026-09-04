-- A new product. products.bullion declares metal_id/mint_id/supplier_id/
-- image_front/image_back/stock/quantity NOT NULL with no default, so a create
-- that omits one raises 23502 naming the column - which is the contract
-- (README: "the database's NOT NULL columns decide what a create needs").
-- created_by/updated_by are not parameters: public.audit_stamp assigns them
-- from the session actor (migration 116).
INSERT INTO products.bullion
       (id, name, metal_id, mint_id, supplier_id,
        image_front, image_back, stock, quantity)
VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING id
