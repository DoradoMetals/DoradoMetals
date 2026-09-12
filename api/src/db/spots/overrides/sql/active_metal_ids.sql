SELECT o.metal_id
  FROM spots.overrides o
 WHERE o.expires_at IS NULL OR o.expires_at > now()
