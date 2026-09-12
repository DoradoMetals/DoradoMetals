UPDATE lots.items SET combined_into_id = $1::uuid WHERE id = ANY($2::uuid[]) RETURNING id
