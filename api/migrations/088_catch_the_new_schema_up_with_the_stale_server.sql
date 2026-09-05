-- Bring the new schema back level with exchange, before dual becomes the dev
-- default.
--
-- THE DRIFT ENGINE IS THE STALE DEV SERVER. It has been running
-- pre-restructure code since Aug 25, so its spot cron and any admin edit wrote
-- exchange ONLY - the dual writes exist in the codebase but not in the process
-- serving traffic. 083 did this same catch-up for spots and said it would be a
-- one-time thing "because from here on the service writes both schemas"; that
-- was true of the code and false of the process. verify:backfill surfaced the
-- gap: three metals' quotes and one bullion row differ between a rebuild from
-- exchange and what the new schema holds.
--
-- Exchange is authoritative while every switch is exchange or dual, so the
-- direction of every statement here is exchange -> new. Idempotent: upserts
-- and guarded updates that can only write what exchange already holds.
--
-- The OTHER differences verify:backfill reports - orders.items,
-- orders.transactions, refiners.items row counts - are the stray dual-run
-- orders (now NINE; the clean:dual-orphans list must be re-derived) and are
-- deliberately not touched here: removing rows is Jacob's, with backups.

-- Spots: verbatim the 083 refresh.
INSERT INTO spots.spots (metal_id, ask, bid, dollar_change, percent_change)
SELECT e.type, e.ask_spot, e.bid_spot, e.dollar_change, e.percent_change
  FROM exchange.metals e
ON CONFLICT (metal_id) DO UPDATE SET
  ask            = EXCLUDED.ask,
  bid            = EXCLUDED.bid,
  dollar_change  = EXCLUDED.dollar_change,
  percent_change = EXCLUDED.percent_change,
  updated_at     = now();

-- Bullion: refresh every business column from exchange.products where the two
-- disagree. The guard keeps this a no-op for rows already level, so re-running
-- moves nothing.
-- 2026-09-06 (ruling 82 rehearsal): `sell_display` is dropped by 119 and
-- `stock` / `quantity` by 131, so on a genesis build - the shape AFTER 133 -
-- those three columns of products.bullion do not exist and this statement
-- aborted the chain. They are dropped from the refresh rather than guarded:
-- there is nowhere left to write them, and exchange keeps its own copies.
UPDATE products.bullion b
SET name = e.product_name, description = e.product_description,
    type = e.product_type,
    bid_premium = e.bid_premium, ask_premium = e.ask_premium,
    display = e.display, homepage_display = e.homepage_display,
    legal_tender = e.legal_tender,
    domestic_tender = e.domestic_tender, is_generic = e.is_generic,
    content = e.content, gross = e.gross, purity = e.purity,
    variant_group = e.variant_group, variant_label = e.variant_label,
    shadow_offset = e.shadow_offset, slug = e.slug,
    filter_category = e.filter_category,
    image_front = e.image_front, image_back = e.image_back,
    -- exchange's timestamp, not now(): the rebuild reproduces exchange, and a
    -- refresh that stamps its own time creates a permanent one-column diff.
    updated_at = e.updated_at
FROM exchange.products e
WHERE e.id = b.id
  AND (b.name, b.description, b.type, b.bid_premium, b.ask_premium,
       b.display, b.homepage_display, b.legal_tender,
       b.domestic_tender, b.is_generic, b.content, b.gross, b.purity,
       b.variant_group, b.variant_label, b.shadow_offset, b.slug,
       b.filter_category, b.image_front, b.image_back)
      IS DISTINCT FROM
      (e.product_name, e.product_description, e.product_type, e.bid_premium,
       e.ask_premium, e.display, e.homepage_display,
       e.legal_tender, e.domestic_tender, e.is_generic, e.content, e.gross,
       e.purity, e.variant_group, e.variant_label, e.shadow_offset, e.slug,
       e.filter_category, e.image_front, e.image_back);
