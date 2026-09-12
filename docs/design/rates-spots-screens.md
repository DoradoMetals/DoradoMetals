# Rates & Spots screens — draft for review

Drawn 2026-09-12 in Figma **Orders** `ymmNlCDLVIfanpRQ7QHMIs`, against
`docs/design/orders-notes-2026-09-05.md` §1-3 (conventions), the Page Header
revision in `docs/design/orders-lots-proposal.md`, and the pricing domain
(`api/src/domains/pricing/{rates,spots,metals}` with the SQL under
`api/src/db/{rates,spots,metals,orders/spots}`). Everything here is DRAFT and
waits on Jacob. No code is written.

Nothing of Jacob's was modified. Every new thing is a library instance, a
variant of a library component, or a local component built from those.

## Where it lives

| page | section | id |
|---|---|---|
| Rates | `Draft · for review · 2026-09-12` | `694:59069` |
| Spots | `Draft · for review · 2026-09-12` | `695:48920` |
| Components | `Draft · Rates · 2026-09-12` | `689:33339` |
| Components | `Draft · Spots · 2026-09-12` | `689:33340` |

Pages `Rates` `689:33337` and `Spots` `689:33338` sit directly after `Pool`.
Both Components sections sit below every existing section with more than the
200px gap.

Desktop is 1440 with 1376 of content, as `Admin / Purchase Order — PO-2481
(Desktop)` `168:2022` does. Mobile is a 390 viewport with 358 of content. Card
chrome — `surface/card`, `border/default`, `radius/base`, `stroke/hairline`,
a `14,12,12,16` title row and a `4,16,16,16 / gap 16` body — follows
`Pool Refiner Card` `671:19456`. Badge colours keep the one language: Warning →
Info → Success, Danger for problems, Neutral Outline for not set.

The `Page Header` local component `656:15023` is used as an instance on every
screen, so the two pages cannot drift from Orders, Inventory and Pool.

---

## 1. Rates

Breadcrumb `Admin › Rates › Scrap` (or `Bullion`). Title **Rates**, chips
`Scrap · Bullion`, description `What we pay and charge · updated Sep 11 by
Dana`, search on the right.

`Rate sheet PDF` and `History` sit in an **Actions row** under the Page Header,
not in a metal card's title row: the PDF is one sheet for every metal and the
history is one log, so repeating them per card would be four buttons for one
action. `Edit` / `Save` / `Discard` stay in the card title row, because editing
is per metal.

### Screens

| state | desktop | mobile |
|---|---|---|
| Read-only (Scrap) | `694:59070` | `694:76405` |
| Editing | `694:65282` | `694:76746` |
| Saving, validation error | `694:65883` | `695:56233` |
| History open | `694:66487` | `694:77137` |
| Bullion view | `694:66498` | — |

### Components

| component | id | states | what the API must provide |
|---|---|---|---|
| `Rate Purity Row` | `689:35572` | `Mode=ReadOnly / Editing / Error` | Purity label and purity % — **new**: `metals.purity_labels` (metal_id, label, purity, sort_order) has no route. Premium % — **new**: no per-purity column exists. Pay / g and Pay / ozt — **new**: computed from the live spot × purity × premium; no endpoint returns a rate preview today. |
| `Rate Tier Row` | `689:35625` | `Mode=ReadOnly / Editing` | Exists. `GET /api/rates` → `RateRead` and `GET /api/rates/tiers` → `RateTier` (`min_qty`, `max_qty`, `unit`, `scrap_pct`, `bullion_pct`, `label`, `top_pct`). Writes are `PATCH /api/rates/:id` with `RatePatch`. |
| `Rate Metal Card` | `690:22868` | `State=ReadOnly / Editing / Error` | Metal list: `GET /api/metals` (admin) returns ids only — **new**: a display name if the card is to read anything but the id. Last-changed line: `GET /api/rates/admin` → `AdminRate` carries `updated_at` / `updated_by`. |
| `Rate Metal Card / Mobile` | `693:39125` | `State=ReadOnly / Editing / Error` | Same as above. |
| `Bullion Rate Row` | `693:23253` | `Mode=ReadOnly / Editing` | Exists. `GET /api/products/admin` and `PATCH /api/products/:id` carry `bid_premium` (buy) and `ask_premium` (sell) per product, plus `type`, `content`, `purity`, `metal_id`. `GET /api/products/types` fills the Type column. The computed buy and sell price is **new** — same rate preview as above. |
| `Bullion Rate Card` | `693:23575` | `State=ReadOnly / Editing` | As above, grouped by metal. |
| `Rate History` | `693:44568` | `Layout=Desktop / Mobile` | **New.** `rates.rates` keeps `updated_by` / `updated_at` for the LAST change only. A history drawer needs a change log (row id, field, old, new, actor, at) and an endpoint to read it. |
| — `Rate sheet PDF` action | on every screen | — | Exists. `GET /api/rates/sheet.pdf` (`api/src/domains/pricing/rates/routes.ts`). Note it carries **no guard** while every other admin rate route is `requireAdmin`. |

### Two premium systems, drawn as two tables

`rates.rates.bullion_pct` is a premium per **metal × weight band**.
`products.bullion.bid_premium` / `ask_premium` is a premium per **product**.
They are not the same number and nothing today reconciles them. The Scrap view
edits the first (the `Weight tiers` block), the Bullion view edits the second.
Jacob should say which one prices a bullion purchase order when both apply.

### The premium column is a proposal, not a read

The brief asks for a premium per purity label. `rates.rates` has no such
column: today a premium is per metal and per weight band, and purity only
scales the fine content. The grid draws the per-purity premium as an editable
Input so the shape can be judged, and the weight tiers beneath it draw what the
table actually holds. If the per-purity premium is not wanted, the purity rows
lose their Input and become a read-only preview of what each label pays.

---

## 2. Spots

Breadcrumb `Admin › Spots › Live`. Title **Spots**, chips `Live · Manual`,
description `Live from the feed · last tick 14s ago`. No search — the Page
Header has no "show search" property, so the search Input is hidden as an
instance override.

### Screens

| state | desktop | mobile |
|---|---|---|
| Live | `695:48921` | `695:54728` |
| Feed stale (Danger banner) | `695:52257` | — |
| Manual override active (Warning banner) | `695:52638` | — |
| Manual override dialog | `695:53033` | `695:54979` |

### Components

| component | id | states | what the API must provide |
|---|---|---|---|
| `Spot Metal Card` | `694:25287` | `Source=Live / Manual / Stale` | Bid, ask, change: exists. `GET /api/spots` → `SpotPrice` (`id` = metal, `ask`, `bid`, `dollar_change`, `percent_change`); `SpotTicker` adds `direction`. **New**: the view does not return `updated_at` even though `spots.spots` has the column (`api/src/db/spots/sql/get_all.sql`), so the tick age and the Stale badge cannot be computed. **New**: `Manual` needs an override source on the row. |
| `Spot Metal Card / Mobile` | `694:25375` | `Source=Live / Manual / Stale` | Same as above. |
| `Manual override` | `694:45178` | `Layout=Desktop / Mobile` | **New.** Two values, not one: `spots.spots` carries `bid` and `ask` and pricing reads both. Needs columns for the override pair, `reason`, `expires_at` and the actor, plus `POST` / `DELETE` endpoints. The feed writer `pricing/spots/service.updateSpotPrices` must skip a metal while an override stands, or the next tick erases it. |
| `Feed Notice` | `694:45260` | `Intent=Danger / Warning` | **New.** Danger is the stale feed, Warning is an override standing. `Retry now` needs an admin endpoint to force a fetch — `updateSpotPrices` is a job with no route. |
| `Lock Row` | `694:45211` | `State=Default / Confirming` | Per order: exists. `GET /api/orders/:id/spots` → `OrderSpot` (`order_id`, `metal_id`, `bid`, `ask`). Unlock is `PUT /api/orders/:id/spots` `{lock:false}` (admin, purchase orders only), which clears both frozen figures — that is why the row confirms in place instead of acting on one click. `Locked at` can use the `updated_at` the view already returns. **New**: `By` is not returned — `api/src/db/orders/spots/sql/get_rows_for.sql` selects `created_at` and `updated_at` but no actor. |
| `Lock Row / Mobile` | `694:45239` | `State=Default / Confirming` | Same as above. |
| `Spot Locks` | `694:54859` | `State=Default / Confirming` | **New.** No endpoint lists locks across orders; only one order at a time. Needs a list of orders where `orders.orders.spots_locked` is true with their `orders.spots` rows. |

---

## 3. What the library could not express

One line each, as agreed.

- **`Input` `State=ReadOnly` looks exactly like `State=Default`.** Both paint
  `surface/card` with a `border/default` hairline, although the component
  description says "full-contrast value on `surface/muted`, no border". The
  read-only screens use the ReadOnly variant, so they will read correctly the
  day the library matches its own description; today read-only and editing look
  the same.
- **`Chart / Sparkline` `3d655cd1…` has no data and no direction property.** It
  is one fixed up-trending drawing, so Platinum shows a green line beside a red
  figure. A down variant, or a real series, is a library change.
- **The library `Drawer` body is a slot an instance cannot fill.** `Rate
  History` is therefore a local component built from the same parts (panel on
  `surface/popover`, hairline, header / body / footer), not a Drawer instance.
- **`Datepicker Layout=Slim` is 342 wide and does not fit the 318 mobile
  column.** The mobile override sheet takes `Expires at` as a field; the desktop
  dialog uses the real Datepicker.
- **`Header` has no `Layout=Mobile, Signed In=True` variant.** Mobile screens
  use `Signed In=False`, so they show the hamburger and no avatar.
- **`Page Header` `656:15023` has no "show search" property.** Spots hides the
  search Input as an instance override rather than editing Jacob's component.

## 4. Drawing conventions used here

- Local components carry **no TEXT component properties**; per-screen values are
  direct text overrides on the instance. Variants carry the states.
- Every colour, radius, spacing and stroke is a bound library variable. No hex
  is written anywhere in either section.
- Coloured figures carry no `+` / `-` sign, per the Orders notes.
- A confirm that destroys data is Primary / Danger (`Unlock`). A confirm that
  only takes a metal off the live feed is Primary / Warning (`Set override`).

## 5. Open questions for Jacob

1. Is the premium per purity label real, or is a premium always per metal and
   weight band with purity only scaling the content?
2. Which premium prices a bullion purchase order — `rates.rates.bullion_pct`
   or `products.bullion.bid_premium`?
3. Does a rate change need a history, and for how long?
4. Should a manual spot override expire on its own, or stand until cleared?
5. Should `GET /api/rates/sheet.pdf` stay unguarded?
6. Who may unlock an order's spots from the Spots screen — anyone with admin,
   or only the person who locked it?
