-- A new product. products.bullion declares metal_id/supplier_id/mint_id/image_front/image_back/stock/quantity NOT NULL with no default, so service.ts must pass all six explicitly or this raises 23502.
-- created_by/updated_by are not parameters: public.audit_stamp assigns them on INSERT (migration 116).
INSERT INTO products.bullion
       (id, name,
        metal_id, mint_id, supplier_id,
        image_front, image_back, stock, quantity)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING id
