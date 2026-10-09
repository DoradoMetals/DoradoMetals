# Pricing file — design vs the API on `dev` (2026-10-09)

Figma **Pricing** `FdBKQiTCRJNS3uJeD1n5zd`, pages `Spots` `0:1` and `Rates`
`6:1934`. Audited against the worktree `/home/jtj60/dorado-lanes/main` at
branch `dev`: every route under `api/src/domains/pricing/**/routes.ts`, the SQL
under `api/src/db/{spots,rates,metals,orders/spots,products,pricing}/sql/`,
`packages/contracts/src/{spots,rates,metals,orders,products}/`,
`api/migrations/000_genesis_schema.sql` and migrations 135-228.

Read first: `docs/design/rates-spots-screens.md` (the 2026-09-12 draft),
`docs/waves/rates-spots-api.md` (what the API wave actually built),
`docs/design/pricing-comments-log.md` (seven comment passes; the screens have
moved a long way past the draft), and the `FOLLOWUPS.md` entry **"Spot sources
with adjustments"**.

What the screens now assert, in one paragraph: there are **several spot
sources**; each **(metal, source)** pair carries its own **bid and ask
adjustment**; each metal has **one active source** whose adjusted spot drives
the card's bid, ask and change; adjustments expire on a custom datetime or **at
market open**; and the page ends in two derived ledgers, an **adjustment log**
and a **lock log**. Nothing in that paragraph except the raw feed figure exists
in the database today.

**Nothing was changed in this worktree.** Counts: 34 rows in §1, 19 in §2, 16
questions in §3.

---

## 1. Drawn, not backed

"Nearest today" names the file checked. Where a row says *nothing*, the grep
that found nothing is named.

### Spots — sources

| # | Drawn | Screen · node | Nearest today | Smallest honest shape |
|---|---|---|---|---|
| 1 | `nFusion` · `Kitco` · `LBMA` — a named row per feed | Spots live `1:556`, Spot sources `20:1971`, rows `694:54742` / `694:54754` / `694:54766` | **Nothing.** `spots.spots` (genesis 2354-2369) is `metal_id, ask, bid, percent_change, dollar_change, updated_at` — no source column. The feed is an HTTP call, `providers/nfusion/feed.ts`, written straight into the table by `pricing/spots/service.ts:28-45`. No `CREATE TABLE` in any migration models a feed (grep `source|feed|provider` hits only `inventory.lot_sources` and `payments.feed_cursors`) | `spots.sources (id text PK — the name, enabled boolean NOT NULL DEFAULT false, sort_order integer NOT NULL)` + audit columns. `GET /api/spots/sources` (admin), `PATCH /api/spots/sources/:id {enabled}` — an edit of one row, so PATCH, not an action (ruling 114) |
| 2 | `Live` · `Standby` · `Off` | same card, Status cell | Nothing. The only `source` value that exists is the derived `'live'|'manual'|'stale'` label on `GET /api/spots` (`db/spots/sql/get_all.sql`, `SpotSource` in `contracts/src/spots/spots.ts`) — and it describes a *metal*, not a feed | A SQL `CASE` on the view, never a column (ruling 112): `Off` = `NOT enabled`; `Live` = enabled and active for ≥1 metal; `Standby` = enabled and active for none. Note the name collision: `SpotPrice.source` already means something else — rename that to `state` |
| 3 | `14s ago` · `9s ago` · `—` last tick per source | same card, Last tick cell | `spots.spots.updated_at` is one timestamp **per metal** and is only written for the metal the active feed quoted. There is no per-source tick anywhere | `last_tick_at timestamptz` on `spots.sources`, stamped by the feed job per fetch. If `Off · no tick` must differ from "polled and failed", add `last_attempt_at` + `last_error` (two more columns, not a table) |
| 4 | `Gold · Silver · Platinum · Palladium` / `—` — the Metals column | same card | Nothing | Derived in SQL from the active-source fact (#5): `string_agg(metal_id)` over the metals whose active source is this row. Not a stored list |
| 5 | **Per-metal active source** — `Active for Gold`, `Active for Palladium`, and `Platinum · active source set to Kitco` in the log | Adjustments `104:5466` Scope cells; log row `104:5356` | **Nothing.** No column on `spots.spots`, `metals.metals` (which is one column, `id`, per ruling 79) or anywhere else | `active_source_id text NOT NULL REFERENCES spots.sources(id)` on a per-metal row — either on `spots.spots` or a small `spots.active_sources (metal_id PK, source_id)`. `PATCH` it. See §2(g): no control on any screen sets it |
| 6 | Bid / ask adjustment per **(metal, source)**: `−0.20% / +0.20%` | Adjustments `104:5466`, rows `104:4344` … `104:4399`; mobile `114:4381` | `spots.overrides` (migration 197) is **one row per metal** holding an **absolute** `bid`/`ask` pair, plus `reason`, `expires_at`. Wrong grain and wrong kind: an absolute price does not track the feed, and "back 0.20%" means *follow the feed, 0.20% under* | `spots.adjustments (metal_id text, source_id text, bid_amount numeric, ask_amount numeric, unit text NOT NULL DEFAULT 'percent', reason text NOT NULL, expires_at timestamptz, expires_at_market_open boolean NOT NULL DEFAULT false, enabled boolean NOT NULL DEFAULT true)`, PK `(metal_id, source_id)`, audit trigger as on `spots.overrides`. Signed numerics, so "up"/"back" is the sign, not a second column. `spots.overrides` is then dead and folds into it |
| 7 | `Global adjustment` · `Every source, every metal` · `−0.10% / +0.10%` | Spot sources `20:1971` → `24:2830` | Nothing | No table — see §2(f): the same screen's Adjustments card says "One adjustment per metal and source", so this row contradicts it. If Jacob wants an inherited default it is one `spots.settings` pair, not a row in the sources list |
| 8 | Adjustment dialog fields: `Adjustment on` switch, `Bid adjust 0.20 %`, `Direction Back/Up`, `Ask adjust`, `Reason`, `Expires at` | `1:588` → `67:3861`, `20:2179` → `67:4007` | `spots.overrides` carries `bid, ask, reason, expires_at` only. No enable flag, no per-side amount, no unit, no market-open flag. The write endpoints are `POST /api/spots/:metal_id/override` and `DELETE` (`spots/routes.ts:18-19`) | The columns in #6. The write is a row edit with no side effect, so `PATCH /api/spots/adjustments/:metal_id/:source_id` and `DELETE` the same path (ruling 114); `POST …/override` is action-shaped for an edit |
| 9 | `Mon Jun 22, 8:30 AM ET · when the market opens`, and `Gold · market closed · last bid …` | `67:3861`; mobile eyebrow on `1:624` | **Nothing.** `grep -i "market_open\|market_closed\|trading_session\|holiday\|session_open"` over every migration and all of `api/src` returns **zero hits** | `spots.market_sessions (weekday smallint, opens_at time, closes_at time, tz text)` + `spots.market_holidays (on date, name text)`, seeded with the COMEX calendar (ruling 116: a business set is rows). The open instant is then one SQL expression; `expires_at_market_open boolean` stores the intent so the instant is recomputed, never frozen wrong |
| 10 | `Set by Dana at 14:06, expires 17:00.` | Feed notice `1:581` | The columns exist (`spots.overrides.created_by`, `updated_by`, `created_at`) but **no read returns them**: `db/spots/overrides/sql/list.sql` selects `metal_id, bid, ask, reason, expires_at` only, and `spots/routes.ts` has **no GET** for overrides at all | Add the audit columns to the adjustments list read and give it a route. `SpotOverrideRead` in `contracts/src/spots/overrides.ts` already omits them — compose from the generated row instead |
| 11 | `Retry now` | Feed notice `1:570` → `694:45246` | `updateSpotPrices` is a cron job only — `shared/cron/scheduler.ts:22`, scheduled by the env var `SPOT_UPDATE_SCHEDULE`. No route | `POST /api/spots/refresh` (admin). A genuine side effect, so POST is right. Separately: the tick interval is a business figure living in an env var; `spots.settings` already holds `stale_after_seconds` and is where it belongs (ruling 116) |
| 12 | Spot card order Gold → Silver → Platinum → Palladium | all Spots screens | `db/spots/sql/get_all.sql` orders by `array_position(ARRAY['Gold','Silver','Platinum','Palladium'], s.metal_id)` — a hardcoded business set, in SQL rather than TypeScript but still a constant | `sort_order integer` on `metals.metals` (today the table has exactly one column, `id`) |
| 13 | A **change figure under bid and a different one under ask** — `$18.40 (0.77%)` vs `0.77% ($18.60)` | every card, e.g. `1:561` → `100:4093` / `100:4098` | `spots.spots` carries **one** `dollar_change` and **one** `percent_change` per metal. `GET /api/spots` returns one of each. A per-side change cannot be derived from them | Either two more columns (`bid_dollar_change`, `bid_percent_change`, and the ask pair) written by the feed job, or the card draws one change for the metal. Four numbers are drawn where two exist |
| 14 | Which source a given metal's figure came from | nowhere on the rebuilt screens | n/a | Not a gap in the API — a gap in the design, see §2(g). Worth noting here because `GET /api/spots` is **public** (`spots/routes.ts:17`, no guard) while sources and adjustments are internal: the adjusted figure may be public, the adjustment may not |

### Spots — the two logs

| # | Drawn | Screen · node | Nearest today | Smallest honest shape |
|---|---|---|---|---|
| 15 | Adjustment log rows: actor, `Gold · nFusion · bid back 0.20% · ask up 0.20%`, `Sep 11, 14:02` | `104:5550`, rows `104:5351` … `104:5371`; mobile `114:4435` | **Nothing.** `spots.overrides` keeps only the current row; its audit columns name the last writer, not the history | Copy the pattern that already works: `rates.rate_history` (migration 198) + an `AFTER UPDATE` trigger. So `spots.adjustment_history (metal_id, source_id, field, old_value, new_value, actor_id, actor_name, changed_at)` fed by a trigger on `spots.adjustments`, and `GET /api/spots/adjustments/history` |
| 16 | `Platinum · active source set to Kitco` — in the same log | `104:5356` | Nothing | The active-source change is a second kind of event. Either one trigger per table writing into the same history table with a nullable `source_id`, or two reads the screen renders as one list. One table is the honest shape; the label is a SQL `CASE` over `field` |
| 17 | `Silver · nFusion · adjustment cleared` | `104:5361` | Nothing | A delete leaves no `AFTER UPDATE` row — the trigger must be `AFTER INSERT OR UPDATE OR DELETE` for "cleared" to exist at all |
| 18 | Lock log rows, **including** `PO-2466 · Gold · unlocked by Dana` | `104:5583`, rows `104:5441` … `104:5461` | `GET /api/spots/locks` (`db/spots/locks/sql/get_all.sql`) is `WHERE o.spots_locked = true` — an unlocked order **can never appear**. `orders.spots` (genesis 1238-1257) has `created_at`/`updated_at` and **no actor column**; an unlock clears `bid`/`ask` in place (`orders/spots/sql/set_bids_from_feed.sql`), so the previous lock is gone | An append-only `orders.spot_locks (order_id, metal_id, bid, ask, action text CHECK (action IN ('lock','unlock')), occurred_at)` + audit, written in `applyLock` (`orders/spots/service.ts:28`) — the one place both directions already pass through. `GET /api/spots/locks/history` |
| 19 | `PO-2481 · Dana Whitfield` — the customer's name on a lock row | Spot locks `32:7521`, rows `110:8399` … `110:8427` | `SpotLock` (`contracts/src/spots/spots.ts`) is `order_id, reference, metal_id, bid, ask, locked_at, locked_by`. No name, no `user_id` | The view already derives `reference` from `order_reference.sql`, so a `customer_name` beside it is consistent (as `BullionStorefront.mint_name` and `RateChange.actor_name` are). Strictly, ruling 12 forbids joining a scalar onto a row — if that is read hard, return `user_id` and let the screen resolve. Jacob's call, §3 |
| 20 | `Locked spot` as one cell, `$2,402.10 / $2,403.60` | `110:8399` | `bid` and `ask` are both returned ✓ | Backed. The single cell is a layout choice |
| 21 | `State=Settled` on a lock row | `110:8419`, `110:8427`; mobile `111:4278` | **No "Settled" exists in the order vocabulary.** `orders.orders.status` was **dropped** by migration 181; the state is derived fresh by `db/orders/sql/order_state.sql` into `OrderState` = `Cancelled · Awaiting Receipt · At Refiner · Awaiting Payout · Ready to Pay · Awaiting Payment · Preparing · In Transit · Completed` (`contracts/src/computed/orders.ts`). "Settled" belongs to `refining.orders.settled_at` (`docs/design/statuses.md` L35) | See §2(h). The lock view should carry the order's existing derived state, or the already-agreed `Unlocked / Locked / Finalized` (`statuses.md` L259; `isFinalized` = `spots_locked` AND `orders.transactions.total IS NOT NULL`, `orders/rules.ts:212`). No new status word |
| 22 | Badge `4 orders` / `6 active` / `3 sources` / `Last 30 days` | card title rows | No read returns a count | These lists are small; a `.length` is not money arithmetic, so a count on the client is honest. `Last 30 days` is not — see #31 |

### Rates

| # | Drawn | Screen · node | Nearest today | Smallest honest shape |
|---|---|---|---|---|
| 23 | Purity label + purity % — `10K / 41.7%`, `Sterling · .925 / 92.5%`, `Scrap · mixed / 80.0%` | Rates scrap `6:2429`, Rate Purity Row `34:7613` | The table **exists**: `metals.purity_labels (metal_id, label, purity, sort_order, tolerance)` — migrations 175/176, genesis 1150-1171 — and so does the contract `PurityLabel` (`contracts/src/metals/purity_labels.ts`). But there is **no repo, no SQL folder and no route**: its only reader anywhere is `db/media/pdfs/sql/content_assay_results.sql:27` | `GET /api/metals/purity_labels` (admin), five verbs over the one table under `db/metals/purity_labels/`. This is the cheapest row in this document |
| 24 | `Premium % of spot` per purity, **editable** | `34:7613` → `689:35541` | No column. `rates.rates` is `(metal_id, unit, min_qty, max_qty, scrap_pct, bullion_pct)` — premium per metal × weight band, with purity only scaling fine content | A `premium_pct` column on `metals.purity_labels` **only if** Jacob says the per-purity premium is real (§3 Q11). The design itself calls the column a proposal |
| 25 | `Pay / g` and `Pay / ozt` per purity row | `6:2429`, every Rate Purity Row | **No endpoint previews a rate.** `/api/quotes/*` price a checkout, an order, or one catalog product (`pricing/routes.ts`); none takes (metal, purity, premium) | `POST /api/quotes/rate_preview` in pricing — ids plus the proposed premium as genuine user input, returning `pay_per_gram` and `pay_per_troy_oz` per purity in one call. Only pricing prices (ruling 75), and the frontend computes no money |
| 26 | `Buy price` / `Sell price` per bullion product | Rates bullion `6:2475`, Bullion Rate Row `36:7229` | `POST /api/quotes/catalog` prices **one** product for **one** side (`db/pricing/sql/product_quote.sql`), so a five-row card is ten round trips | The same preview endpoint, list-shaped: a metal in, a row per product with both sides out |
| 27 | Card badge `Top 92%` (Gold), `Top 80%` (Silver) | `6:2438` → `691:22857` | `RateTier.top_pct` (`contracts/src/computed/rates.ts`) is `max(scrap_pct, bullion_pct)` across the metal's bands = **98** for Gold, not 92. 92 is the maximum of the *purity* premium column, which does not exist | Falls out of #24 if the per-purity premium is real; otherwise the badge should read `top_pct` and say so |
| 28 | Per-row `Top rate` — `96% top`, `98% top`, `99% top` | Rate Tier Row `35:7418` | `top_pct` is **one number per metal**, not per band. Each Gold band draws Scrap 90 / Bullion 98, so no row derives 96, 98 and 99 | Nothing holds a per-band top. Drop the column or move the figure to the title badge — see §2(o) |
| 29 | `5 purities · 3 tiers · updated Sep 11` per card, and `What we pay and charge · updated Sep 11 by Dana` in the header | `6:2438`; Admin Header `23:7552` | `GET /api/rates/tiers` → `RateTier` carries no timestamp. `GET /api/rates/admin` → `AdminRate` carries `updated_at`/`updated_by` **per row**, so the per-metal line is a `MAX()` over rows and the header is a `MAX()` over the whole table | Add `updated_at`/`updated_by` to `RateTier` (the `MAX` computed in the tier read), and one more for the page line. A `MAX` in TypeScript is a view stitched in code |
| 30 | Rate history row `Gold · 5–20 ozt · scrap 88% → 90%` | Rate History `39:8493` | `GET /api/rates/history` (`db/rates/sql/get_history.sql`) returns `rate_id, field, old_value, new_value, actor_id, actor_name, changed_at`. **No metal, no band label.** Composing "Gold · 5–20 ozt" from a `rate_id` on the client is a wire-to-column re-spelling in TypeScript | Return `metal_id` and the band label **as it was at the change** from SQL. The trigger already logs `min_qty`/`max_qty` edits, so reading today's band for an old row is wrong twice over |
| 31 | `Gold · last 30 days · 6 changes` | `39:8494` | `get_history.sql` has no `WHERE`, no `LIMIT`, no count and no metal filter, and `rates.rate_history` is indexed on **`rate_id` only** (genesis 5673) — nothing supports a time window | `?since=` and `?metal_id=` params, a count, and `CREATE INDEX … ON rates.rate_history (changed_at DESC)`. Also see §2(m): the drawer's title says Gold and its rows span three metals |
| 32 | Validation `Must be between 50 and 150.` (desktop) / `Must be 50–150 of spot.` (mobile) | `6:2460` → `689:35557`; `6:2518` | **Unenforced anywhere.** `rates.rates` has only `rates_max_gt_min`, `rates_min_nonneg` and the `rates_no_overlap_qty` EXCLUDE (genesis 3428-3448); `pricing/rates/rules.ts` holds `assertRate` and `assertChanged` and no range check | A `CHECK` on both pct columns plus one assert in `rules.ts` (the only place a domain error may be raised). If 50/150 is a business figure rather than a sanity bound, it is a `spots.settings`-style row, not a constant |
| 33 | `Rate sheet PDF` | every Rates screen, e.g. `6:2436` | Exists — and **still unguarded**: `rates/routes.ts:21` is `router.get('/sheet.pdf', generateRateSheet)` while every other admin rate route carries `requireAdmin`. The draft flagged this on 2026-09-12 and it is unchanged | Either `requireAdmin`, or a deliberate public rate sheet. §3 Q14 |
| 34 | Bullion premiums, `Type`, product names | `6:2484`, `693:23278` …; `Type` column | Backed: `products.bullion.bid_premium` / `ask_premium` (genesis 1841-1902), `GET /api/products/admin`, `GET /api/products/types`, `PATCH /api/products/:id` (`catalog/products/routes.ts`) | No change — but see §2(r): ruling 51 says `bid_premium` does not price a purchase order, so the drawn **buy** column edits a number almost nothing reads |

---

## 2. Business logic that looks wrong in the design

### The one that matters most

**(a) An adjustment changes the admin screen and nothing else.** `spots.overrides`
is read by **exactly one statement in the codebase**, `db/spots/sql/get_all.sql`
(the display read behind `GET /api/spots`). Every statement that actually prices
money joins `spots.spots` **raw**: `purchase_quote.sql:20`, `sale_quote.sql:56`,
`order_pricing.sql:27,42`, `product_quote.sql:13`, `profit_breakdown.sql:63`.
Worse, `pricing/spots/service.ts:38` **skips** any metal with a standing
override, so the feed stops writing that metal and the frozen pre-override tick
is what every customer is paid and charged. The wave doc claims this was fixed —
it was fixed in the display read only.

Nothing is wrong with the design here: the Adjustments card asserts exactly the
right thing. The **API** is wrong. The fix is one resolver — a view
`spots.resolved (metal_id, bid, ask, …)` that applies the active source's
adjustment once, which `get_all.sql` *and* all five pricing statements join
instead of `spots.spots`. Until that exists, building the screens would let an
admin believe they had moved a price when they had not. **Overhaul (API only);
no screen change.**

### Spots

| # | What is wrong | Screen · node | Why | Fix |
|---|---|---|---|---|
| b | The adjustment-active screen draws the **same** Gold bid and ask as the live screen (`$2,411.20` / `$2,412.80`) while its banner says an adjustment of back 0.20% / up 0.20% is standing | `1:577` card `1:583` vs `1:556` card `1:561` | A screen asserting "adjusted" must show the adjusted figure, or the number is decoration. This is the same mistake the API wave caught in SQL ("an override has to change the number every price reads, not just a status label next to the old one") | **small** — retext two values (≈ `$2,406.38` / `$2,417.63`) |
| c | Three statements about Platinum that cannot all be true: Sources says Kitco serves `—` metals; the log says `Platinum · active source set to Kitco`; Adjustments marks `Platinum · nFusion` as `Live` and has no Platinum · Kitco row | `20:1971` Kitco row, `104:5356`, `104:4377` | A reader cannot tell which source Platinum is on. In Jacob's model that is the load-bearing fact | **small** — Kitco's Metals cell reads `Platinum`, Platinum · nFusion's Scope reads inactive, add the Platinum · Kitco row |
| d | The `Scope` column holds three vocabularies: `Active for Gold` (the pair's role), `Standby` and `Live` (the *source's* status) | Adjustments `104:5466`, all six rows | One column, two different facts; "Standby" does not say whether the pair is dormant or the feed is | **small** — one derived label per pair, `Active` / `Dormant`, computed in SQL; source status stays on the Sources card |
| e | Badge `6 active` over six rows, one of which (`Palladium · Kitco`) has `—` / `—`; mobile shows four rows under the same badge | `104:4269`; mobile `114:4381` | A count that disagrees with the list it labels. `active` should count adjustments that exist, not rows drawn | **small** — badge reads `5 active`, mobile lists the same rows as desktop |
| f | `Global adjustment · Every source, every metal` sits on the Sources card while the Adjustments card directly below says `One adjustment per metal and source`; the Sources card's `Bid adjust` / `Ask adjust` columns repeat the Adjustments card | `24:2830`, `20:1971` header cells vs `104:5466` | Two contradictory assertions about the model on one screen. The comment log already records the global row as dropped in Jacob's per-pair model | **small** — remove the global row and the two columns (already offered to Jacob; §3 Q3 if he wants an inherited default) |
| g | **No control anywhere sets a metal's active source**, yet the log records the event and the whole model turns on it | all five desktop Spots screens; the per-metal panel that carried the Select was deleted after `1959437664` | A state the screens cannot reach. Also: after the card rework there is no per-card source or state line either, so a metal's active source is invisible as well as unsettable | **small** — a `Source` Select in each spot card's title row (four Selects), or an `Active source` column on the Adjustments card. It must land somewhere before this ships |
| h | Lock states `Open · Confirming · Settled` | Lock Row `110:8399` / `110:8435` / `110:8419` | `Confirming` is a UI step and fine as a variant. `Settled` is not a fact this system holds: the order's derived vocabulary (`OrderState`) has no such value, and the Orders file's own Spots card already uses `Unlocked / Locked / Finalized` (`statuses.md` L259). Three names for one fact across two files | **small** — rename the third state `Finalized` and derive it from `spots_locked AND orders.transactions.total IS NOT NULL` (`orders/rules.ts:212`), or carry the order's `OrderState` and label from it |
| i | A `Settled` row carries **no** Unlock action | `110:8419`, `110:8427` | Ruling 112: an admin should be able to do anything; a status must not drive logic. Hiding the action makes the label a gate | **small** — keep `Unlock`, as a `confirm` (or, since repricing a paid order is serious money, an `override` with a stored reason) |
| j | `SO-1112` is drawn with an `Unlock` action on both the locks card and the lock log | `110:8419`, `104:5451`, mobile `111:4278` | `PUT /api/orders/:id/spots` refuses anything but a purchase order — `orders/spots/service.ts:14`, `rules.assertDirection(…, 'purchase', 'the spots PUT')` — while `GET /api/spots/locks` lists **every** locked order, sales included. The drawn button 400s today | **small** on the screen (no action on sale rows) — or Jacob decides sales spots are unlockable too, which is an API change. §3 Q9 |
| k | Lock log badge reads `4 orders` over five rows, one of which is an unlock event; mobile drops that row and keeps the badge | `104:5733` vs its rows; mobile `114:4477` | The badge counts orders, the list shows events. Two different things in one card | **small** — badge reads `5 events`, or the log lists only the current lock per order |
| l | The stale-feed screen flips all four cards to `Direction=Down` with a uniform `0.50%` | `1:566`, cards `1:572` … `1:575` | Its own banner says "Orders still price from the last good tick" — so the figures and directions must be the live screen's (Up, Up, Down, Up), not a new set. Also `$12.10` on Platinum's `$978.30` is 1.24%, not the drawn 0.50% | **small** — copy the live screen's four figures and directions |
| m | `Weight tiers · rates.rates` — a database table name printed in the admin UI | `6:2438` tier block title | Internal vocabulary on an operator's screen | **small** — `Weight tiers` |

### Rates

| # | What is wrong | Screen · node | Why | Fix |
|---|---|---|---|---|
| n | The Rate History drawer is titled `Gold · last 30 days · 6 changes` and lists Silver and Platinum rows | `39:8494`, rows under it | The scope line contradicts the content; the route has no metal filter either (#31) | **small** — title `All metals · last 30 days`, or filter the rows to the card's metal |
| o | Per-row `Top rate` (`96% top` / `98% top` / `99% top`) beside identical Scrap 90 / Bullion 98 cells on every Gold band | Rate Tier Row `35:7418` | Not derivable from the row's own figures, and `top_pct` is one number per metal. A column no fact can fill | **small** — drop the column; the card badge already carries a top |
| p | `Pay / g` **and** `Pay / ozt` — the same figure twice (`29.34 × 31.1035 = 912.5`) | `6:2429`, every purity row | Two money columns one multiplication apart invite a `× 31.1035` on the client, and the frontend computes no money | **small** — one column with a unit toggle, or both figures returned by the preview endpoint (#25) |
| q | `Applies to · All purities` — the same constant string in every tier row | `35:7418` | `rates.rates` has no purity dimension, so the column states a fact about the schema, not about the row | **small** — drop the column |
| r | The Bullion card's `Premium over spot (buy)` is editable per product | `6:2484`, `693:23278` … | **Ruling 51 already decided this**: a purchase-order bullion premium comes from **rates**, a sales-order premium from the bullion's `ask_premium`. `products.bullion.bid_premium` is read only by `product_quote.sql` (`side='bid'`), the single-product catalog quote — so a customer can be quoted one number for a coin and paid a different one inside a purchase order (`purchase_quote.sql` retiers by the order's weight using `rates.rates.bullion_pct`). Editing the buy column moves the quote and not the order | **small** on the screen (drop the buy column) — but the real fix is in code: either `bid_premium` and the `side='bid'` branch of `product_quote.sql` go, or ruling 51 is amended. §3 Q12 |
| s | The scrap card edits a per-purity premium **and** per-band `Scrap %`, both claiming to price the same gram | `6:2429`, purity rows vs tier rows | Two premium systems on one card with no stated precedence. The design names this as a proposal; it is still the screen's biggest open question | **small** once Q11 is answered (the purity Input becomes a read-only preview if the answer is no) |
| t | Four chips with two selected: `Rates · Spots` plus `Scrap · Bullion` | `23:7552` chip row | Two independent single-selects drawn as one row. Ruling 122 wants two chip rows, each single-select | **small** — second chip row, or `Scrap`/`Bullion` becomes a Select |

---

## 3. Rulings the design needs that nobody has made

1. **Is an adjustment a percent, a dollar amount, or either?** → percent, stored signed with a `unit` column defaulting to `'percent'` so dollars stay possible without a migration. *(FOLLOWUPS names this as still open.)*
2. **Does the adjusted spot price customer orders, or only inform the admin screen?** → it prices everything, through one `spots.resolved` view that all five pricing statements join. Today's override does neither (§2a).
3. **Is there a global default adjustment that every (metal, source) pair inherits?** → no; one row per pair, absent = none.
4. **Is the active source per metal, or per metal and side?** → per metal.
5. **What happens to an adjustment on a source that is not active for that metal — stored and dormant, or refused?** → stored and dormant; that is what `Gold · Kitco` is for.
6. **Does an adjustment expire at market open by default?** → yes, and the market calendar is rows (`spots.market_sessions` + `spots.market_holidays`), not a constant.
7. **May a metal have no enabled source (every feed off)?** → yes, and the metal then reads `stale` with its last tick; pricing must not silently use a figure with no source.
8. **Lock states: is the third state `Finalized` (locked + a total) or "paid out"?** → `Finalized`, matching `statuses.md` and `orders/rules.ts:212`; no new status word.
9. **May a sales order's spots be unlocked from this screen?** → yes, and the purchase-only assert on `PUT /api/orders/:id/spots` comes off; otherwise the SO rows lose their action.
10. **Who may unlock — any admin, or the person who locked?** → any admin, with the actor recorded, as an `override` guard once the order is finalized (ruling 112).
11. **Is a premium ever per purity label, or always per metal and weight band?** → always per metal and band; the purity rows become a read-only preview of what each label pays.
12. **Ruling 51 says a purchase bullion premium comes from rates and a sale from `ask_premium`. Does `bid_premium` and the `side='bid'` branch of `product_quote.sql` therefore go?** → yes, and the Bullion card's buy column goes with them.
13. **Is the 50–150 premium bound a sanity `CHECK` or a business figure?** → a `CHECK` plus a `rules.ts` assert; a row only if Jacob wants to move it without a migration.
14. **Does `GET /api/rates/sheet.pdf` stay unguarded?** → no; `requireAdmin` like every other admin rate route.
15. **How long does rate and adjustment history live, and is the drawer scoped to one metal?** → keep forever (both tables are tiny), default the read to 30 days, scope the drawer to the card's metal.
16. **Does the Spots page keep both the actionable `Spot locks` card and the `Lock log`?** → one surface: the log, with `Unlock` on its open rows. *(Already asked on comment `1959438694`.)*
