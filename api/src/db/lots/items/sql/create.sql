INSERT INTO lots.items (metal_id, unit, quantity, pre_melt, post_melt, purity, image_id)
VALUES ($1::text, COALESCE($2::text, 't oz'), COALESCE($3::numeric, 1),
        $4::numeric, $5::numeric, $6::numeric, $7::uuid)
RETURNING id, bullion_id, metal_id, unit, quantity, pre_melt, post_melt, purity,
          content_snapshot, content, image_id, split_from_id,
          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
          to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
          created_by_id, updated_by_id,
          declared_unit, declared_quantity, declared_pre_melt, declared_post_melt,
          declared_purity, declared_content,
          to_char(assayed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS assayed_at,
          combined_into_id
