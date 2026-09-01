-- Every enabled tier, verbatim (the TiersRow contract). FREE rides along with
-- display=false: which rows a surface shows is the client's branch - the
-- customer checkout filters to display, the admin drawer offers all three.
SELECT id, code, label, price, free_over, transit_label,
       sort_order, display, enabled, created_at, updated_at
  FROM shipping.tiers
 WHERE enabled
 ORDER BY sort_order ASC, id ASC
