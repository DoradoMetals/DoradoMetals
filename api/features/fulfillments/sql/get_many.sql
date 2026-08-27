-- Several fulfillments by id, for composing a list.
SELECT id, order_id, method_id, status, created_at, updated_at,
       created_by_id, updated_by_id
  FROM fulfillments.fulfillments
 WHERE id = ANY($1::uuid[])
