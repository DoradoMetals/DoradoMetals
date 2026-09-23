# People screens — card chrome onto the Accordion

Figma file **People** `5cEytffOkxIfqdRWFaTWpl` (Customers / Leads / Employees,
moved out of the Orders file). Pass run 2026-09-22 against Jacob's ask:
"make sure they're all using our accordion component just like in Orders."

Reference read from Orders `ymmNlCDLVIfanpRQ7QHMIs`: `Totals` `152:1187` and
`Spots` `269:8922`, both in Components › `Orders · order screen cards`.

## The reference chrome

Outer frame — `AL=VERTICAL`, pad `0`, gap `0`, fill `surface/card`, stroke
`border/default` at `stroke/hairline` on all four sides, radius `radius/base`,
`clipsContent=true`, `FILL/HUG`.

Then one of two shapes:

| shape | child 1 | child 2 |
|---|---|---|
| **Totals** — no control in the title row | `Header`, an INSTANCE of the library `Accordion` (`Open=True, State=Default, Chevron=Leading`), **fills and strokes cleared**, `FILL/HUG` | `Body` frame, vertical, pad `spacing/2xs` / `md` / `md` / `md`, `clipsContent=false` |
| **Spots** — a control in the title row | `Title row` frame (`AL=HORIZONTAL`, pad right `spacing/sm`, gap `spacing/xs`, `clipsContent=false`) holding the same `Header` instance plus a `Right` frame (pad top `spacing/sm`, gap `spacing/xs`, `clipsContent=false`, HUG) | same `Body` frame |

**Correction to `customers-leads-screens.md` §7.5.** That doc says the
`Accordion` "ships a demo body" that every instance must hide. It does not, for
this variant: `Open=True, State=Default, Chevron=Leading` has exactly one child,
its own `Header` frame. Jacob's `Totals` has nothing hidden and neither does
anything here. There was no demo `Content` slot to hide on any of the 22 cards.

## The one defect, and it was uniform

Every accordion card in the file was already an instance of the right library
`Accordion` with the right variant and the right props. What was wrong was that
each `Header` instance **kept its own `surface/card` fill and its own
`border/default` 1px stroke on all four sides**. That drew a second rounded,
outlined box inside the card around the title row — stopping short of the right
edge, with the card's control (`Edit`, `New order`, `Adjust credit`, `Add
account`, `Add note`) stranded outside it. Jacob's cards clear both.

Secondary, on the same cards: `Title row` / `Right` / `Body` carried
`clipsContent=true` (reference: `false`), their paddings and gaps were raw
numbers rather than bound `spacing/*` tokens (values already matched), and six
cards carried a `Title row` wrapper with **no** `Right` sibling — a vestigial
12px right inset where the reference has the `Header` as a direct child.

Nothing else differed. Every outer card frame already carried the right fill,
the right stroke bound to `stroke/hairline`, `radius/base`, pad 0 and
`clipsContent=true`, so no outer frame was rebuilt.

## What was changed — 22 cards

Per card: `Header` instance `fills=[]` and `strokes=[]`; `Body`
`clipsContent=false` with paddings bound to `spacing/2xs` (top) and `spacing/md`
(other three); wrapper either unclipped and token-bound (control present) or
removed with the `Header` reparented to the card (no control).

### Page `Users` `37:2091`, section `Draft · for review · 2026-09-12` `37:2228`

| screen | cards rebuilt | shape |
|---|---|---|
| `Admin / Customer — Marguerite Whitfield` `37:2248` | `37:2254` Details · `37:2266` Orders · `37:2293` Credit · `37:2305` Payout accounts · `37:2314` Timeline · `37:2328` Notes | Spots ×6 |
| `… · Banned` `37:2340` | `37:2346` · `37:2358` · `37:2385` · `37:2397` · `37:2406` · `37:2420` | Spots ×6 |
| `Mobile · Customer — Marguerite Whitfield` `37:2558` | `37:2574` Details · `37:2581` Orders · `37:2607` Payout accounts · `37:2613` Timeline | **Totals** ×4 (wrappers `37:2575` `37:2582` `37:2608` `37:2614` removed) |
| same | `37:2599` Credit · `37:2622` Notes | Spots ×2 |

### Page `Leads` `0:1`, section `Draft · for review · 2026-09-12` `34:2476`

| screen | cards rebuilt | shape |
|---|---|---|
| `Admin / Lead — Dwight Okafor` `34:2496` | `34:2517` Details · `34:2530` Timeline | Spots ×2 |
| `Mobile · Lead — Dwight Okafor` `34:2702` | `34:2719` Details · `34:2728` Timeline | **Totals** ×2 (wrappers `34:2720` `34:2729` removed) |

Every card came out at its original size and position: 22 of 22 unchanged.

## Cards left alone, and why

| card | ids | why |
|---|---|---|
| `Messages`, `Calls` | on `37:2248` `37:2340` `37:2558` `34:2496` `34:2702` | library `Chat` instances. Their title rows were already correct — they are the look the rebuilt cards now match. |
| Row-list containers | `37:2233` `37:2245` `37:2552` `37:2677` `37:2635` `37:2655` (Users) · `34:2481` `34:2493` `34:2677` `34:2699` (Leads) | head-row + rows + foot, the same shape as Jacob's own `Directory` `10:275`. The Orders list cards carry no Accordion either. |
| Empty-state shells | `37:2245` `37:2677` `34:2493` `34:2699` | card shell wrapping an `Empty State` instance; no title row to put on an Accordion. |
| Dialogs | `37:2526` Adjust credit · `34:2592` Convert · `34:2653` Delete | composed frames wearing the Dialog tokens, per `customers-leads-screens.md` §7.1 (the library `Dialog` has no body slot). Not cards. |
| Jacob's own | `10:275` Directory · `10:519` Activity · `12:724` Activity | his `Admin / People (Desktop)` `9:58` and `(Mobile)` `12:494`. Untouched — see below. |

## Noted, not fixed

1. **Jacob's own `Activity` cards** (`10:519` desktop, `12:724` mobile) title
   themselves with a bare `TEXT "Activity"` and card padding `16/16/8/16`
   instead of an `Accordion` header. They are the same card-with-a-title
   pattern this pass just put through the Accordion everywhere else. His file,
   his nodes — left alone, flagged for him.
2. **`Body` gap held at what was drawn.** The reference `Body` uses gap
   `spacing/md`. Every card here is gap `0` except the two `Notes` cards at
   `12`. Their row components (`Detail Line`, `Ledger Row`, `Timeline Row`,
   `Payout Account Row`, `Address Row`) carry their own vertical padding, so
   forcing `16` would re-space content on all 22 cards. Paddings were bound to
   tokens; the gap was left. **Wants a ruling.**
3. **Title-row control labels differ desktop → mobile** — `Adjust credit` →
   `Adjust`, `Add note` → `Add`, and `Details` uses a 22px `Edit` link while
   the others use buttons. Not chrome; not touched.
4. **The dialogs' footers are hand-spaced button rows** in a `SPACE_BETWEEN`
   frame, and their close control is a raw `x` icon instance rather than the
   library `Dialog`'s own `Show close`. Both fall out of §7.1 — the `Dialog`
   component still needs a body slot.
5. **Page `Employees` `37:2092` is empty.** The brief lists Employees admin
   screens; nothing is drawn there yet. Nothing to conform.
6. No `Admin Header` was found on any detail screen — the Customer and Lead
   screens carry their own breadcrumb + title block (`34:2499` and its
   Customers twin), which is correct.

## Verification

| check | result |
|---|---|
| Cards conforming after the pass | **22 / 22** — header instance resolves to `Accordion / Open=True, State=Default, Chevron=Leading`, fills empty, strokes empty, body paddings bound, body unclipped |
| Card sizes and positions | unchanged on all 22 |
| Broken instances, all three pages | **0** of 1,126 |
| `get_metadata` spot-check `37:2574` | `Details` 358×214 → `Header` instance 358×48 + `Body` 358×166 — exactly the `Totals` shape |
| Screenshots | `Admin / Customer — Marguerite Whitfield` `37:2248` and `Admin / Lead — Dwight Okafor` `34:2496`, before and after |
| Side-by-side proof | rebuilt `Notes` `37:2328` cloned to 400px beside Jacob's `Totals` `152:1187` at 400px — same edge, same radius, same chevron-and-label title row with no inner box, same body inset. Scratch copy `47:4156` deleted after. |

Nothing outside the 22 cards' `Header` / `Title row` / `Right` / `Body` nodes
was written. No node of Jacob's was edited.
