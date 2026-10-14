# Spot history, sources and the live stream

Jacob's rulings, 2026-10-14: quotes are stored per source; history is kept; screens never read raw ticks; stale pricing continues from the last good tick with a warning; live spots are pushed, not polled.

## Tables

- `spots.ticks (source_id, metal_id, at timestamptz, bid numeric, ask numeric)`, primary key `(source_id, metal_id, at)`, range-partitioned by month on `at`, BRIN index on `at`. Append-only. A poll that returns the same bid/ask as the previous tick for that source and metal writes nothing here (the source's `last_tick_at` is the heartbeat). Nothing but the rollup job reads it.
- `spots.current (source_id, metal_id, bid, ask, at)`, primary key `(source_id, metal_id)`: the latest quote per source and metal, upserted on every poll that changed. Replaces the one-row-per-metal `spots.spots` as the resolver's input. `spots.spots` is kept until the resolver and every reader are on `current`, then dropped under the verify-before-drop rule.
- `spots.candles (source_id, metal_id, interval text in ('1m','1h','1d'), bucket_start timestamptz, open, high, low, close numeric, ticks integer)`, primary key `(source_id, metal_id, interval, bucket_start)`. Built from bid; ask candles are not kept (charts show bid; the spread is on the card). Maintained incrementally by the feed job: the open minute is updated on each changed tick, a minute closes on the boundary, hours roll up from closed minutes, days from closed hours. Buckets exist only where ticks exist (no synthetic gaps when the market is closed).
- `spots.settings` gains `ticks_retention_days` (90), `minute_candles_retention_days` (365); hour and day candles are kept. A nightly job drops tick partitions and minute candles past retention.

## Resolution

A metal's source is its `active_sources` override, else the source with `is_default`, else the next enabled source by `sort_order` whose `current` row is fresh. The four override rows seeded by migration 240 are deleted so every metal follows the default. `spots.resolved` reads `current` for that source, applies the adjustment (signed amount in its unit) or returns the frozen pair, and carries `state`: `live` when the row is younger than `stale_after_seconds`, `stale` when older (the price still flows from it), `frozen` while a freeze row exists. Stale never refuses: orders still price from the last good tick, and every spot read carries `state` and `last_tick_at` so the screens warn.

## Charts

`GET /api/spots/metals/:metal_id/candles?source=&range=1D|1W|1M|1Y` returns candles only: 1D from minutes, 1W and 1M from hours, 1Y from days, for the metal's resolved source unless `source` is given. Hundreds of rows at most.

## The stream

`GET /api/spots/stream` is Server-Sent Events: after every poll the feed job emits; the handler sends the resolved board (every metal's bid, ask, change, state, last tick, plus the paused list) when it changed, and a comment heartbeat every 20 seconds. One api replica today, so an in-process emitter; `LISTEN/NOTIFY` becomes the bus when there are two. The client's `useSpotStream()` writes each event into the TanStack cache under the spots key; the poll stays as a slow fallback while the stream is down.

## Sizes

Four metals, three sources, 30-second polls: about 11,500 ticks a day per source before dedupe, under 1 GB a year raw; candles are a few thousand rows per source per year.
