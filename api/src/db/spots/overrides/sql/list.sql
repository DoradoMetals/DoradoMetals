SELECT o.metal_id, o.bid, o.ask, o.reason, o.expires_at
  FROM spots.overrides o
 ORDER BY o.metal_id ASC
