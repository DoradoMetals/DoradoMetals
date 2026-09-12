# Figma cleanup — Orders file, 2026-09-12

File **Orders** `ymmNlCDLVIfanpRQ7QHMIs`. Jacob spent the night editing it by
hand: pages were consolidated, the customer-facing pages and the Customers /
Leads / Rates / Spots pages are gone, and an `Archive` page now holds his
superseded work. This pass starts from **what is in the file**, not from what
the drafting docs say was drawn.

Source of truth for "ours": `inventory-pool-screens.md`, `orders-screens.md`,
`customers-leads-screens.md`, `rates-spots-screens.md`, `customer-screens.md`,
`orders-lots-proposal.md`.

## Rules applied

1. **Nothing of Jacob's is deleted.** Our nodes are `638:` and up; anything
   lower is his, and so is anything on a page he made that our docs do not
   list. His candidates are listed for him, never touched.
2. **Nothing a live draft instantiates is deleted.** Every instance in the file
   was mapped back to its local main component, page by page (6 pages, 8,396
   instances). A component with a single instance outside the delete set is
   kept.
3. **Scope hold — Inventory and Pool.** Jacob made separate files for Inventory
   and Pool and a port is in flight. The `Inventory` and `Pool` pages and the
   `Draft · Inventory · 2026-09-11` / `Draft · Pool · 2026-09-11` sections are
   untouched, and so is everything they instantiate. Candidates there are
   listed under **After the port**.

## Pages as they stand

| page | id | whose | note |
|---|---|---|---|
| Orders | `660:10613` | his + our draft section | 16 top-level nodes |
| Inventory | `660:10614` | his + our draft section | **hold — port in flight** |
| Pool | `660:10615` | our draft section | **hold — port in flight** |
| Components | `660:10616` | his + 8 draft sections | 11 sections |
| Proposal · positions | `618:4459` | ours | was the `Orders & Lots` page; he renamed it and moved his own work off |
| Archive | `660:10617` | his | 5 sections of his superseded work |

Gone since the docs were written: `Customers`, `Leads`, `Rates`, `Spots`,
`Customer · Landing`, `Customer · Shop`, `Customer · Sell`,
`Customer · Account`, `Customer · Orders`.

---

## 1 · Page `Orders` `660:10613`

| id | type | name | whose | instances | verdict |
|---|---|---|---|---|---|
| `620:5115` | FRAME | Admin / Orders & Lots | his | — | keep |
| `641:13343` | TEXT | Purchases · Customers | his | — | keep |
| `620:5789` | FRAME | Admin / Orders & Lots — Sales | his | — | keep — sales orders stay for admin |
| `641:13344` | TEXT | Sales · Customers | his | — | keep |
| `634:12204` | FRAME | Admin / Orders & Lots — Refiners | his | — | keep |
| `641:13346` | TEXT | Purchases · Refiners | his | — | keep |
| `634:13082` | FRAME | Admin / Orders & Lots — Completed | his | — | keep |
| `641:13347` | TEXT | Completed | his | — | keep |
| `168:2022` | FRAME | Admin / Purchase Order — PO-2481 | his | — | keep |
| `358:4893` | FRAME | Sales Order (Admin) | his | — | keep — admin sales order |
| `320:2717` | FRAME | Sales Order (Refiner) | his | — | keep |
| `358:6416` | FRAME | Purchase Order (Refiner) · Sent | his | — | keep |
| `380:4833` | FRAME | Draft Purchase Order (Refiner) | his | — | keep |
| `396:4895` | FRAME | Draft Sales Order (Refiner) | his | — | keep |
| `291:9181` | TEXT | States · how to swap | his | — | keep |
| `664:11578` | SECTION | Draft · for review · 2026-09-11 | ours | 30 children | keep, minus two notes |

Inside `664:11578`:

| id | type | name | verdict |
|---|---|---|---|
| `673:20375` `673:34763` `719:15329` `719:16091` `719:16814` `721:17087` `721:17154` `721:17220` `729:34954` `729:35427` `729:36214` `729:36280` `743:38918` `743:39626` | FRAME ×14 | the screen copies | keep — every one is a deliverable in `orders-screens.md` §4 |
| `721:17371`–`721:17378`, `730:46793`–`730:46796`, `743:39709` `743:39710` | TEXT ×14 | screen labels | keep — exactly one per kept frame |
| `673:35312` | TEXT | Draft note | **delete** — note; verbatim in `orders-screens.md` |
| `673:35313` | TEXT | Held · library limits | **delete** — note; its live half is `orders-screens.md` §6, and its "ten columns … full 1376 width" half describes the settlement grid Jacob cut (§2) |

No superseded draft survives here: the earlier settlement grid, the `Received`
axis and `Settlement · proposed / Mobile` `722:46038` were all deleted in the
passes the docs record. No empty frames and no hidden nodes on the page.

---

## 2 · Page `Components` `660:10616`

| id | section | whose | verdict |
|---|---|---|---|
| `661:7706` | Orders · order screen cards (35 sets) | his | keep |
| `661:7707` | Orders · list (5) | his | keep |
| `661:7708` | Inventory · lots (4) | his | keep |
| `664:11577` | Draft · Orders · 2026-09-11 (14) | ours | keep — **all 14 sets are instantiated** (see below) |
| `667:13894` | Draft · Inventory · 2026-09-11 (15) | ours | **hold — port in flight** |
| `667:13895` | Draft · Pool · 2026-09-11 (4) | ours | **hold — port in flight** |
| `688:34720` | Draft · Customer · 2026-09-12 (3) | ours | **delete** — see below |
| `688:35714` | Draft · Customers · 2026-09-12 (11) | ours | keep + list — see **After the port** |
| `688:35715` | Draft · Leads · 2026-09-12 (5) | ours | keep + list |
| `689:33339` | Draft · Rates · 2026-09-12 (7) | ours | keep + list |
| `689:33340` | Draft · Spots · 2026-09-12 (7) | ours | keep + list |

### `664:11577` — every set is referenced, nothing is orphaned

| component set | instances (all on page `Orders`) |
|---|---|
| `664:12789` Order State | 30 across the draft screens and the Components page |
| `671:26494` Order Header · proposed | 6 |
| `671:28373` Order Header · proposed / Mobile | 6 |
| `671:28586` Order Card · proposed | 6 |
| `671:28777` Order Card · proposed / Mobile | 2 |
| `710:49549` Match settlement lines | 2 |
| `715:38985` Filter Bar · proposed | 1 |
| `728:45748` Linked Fulfillment · proposed | 2 |
| `729:17246` Lots · proposed | 1 |
| `729:17608` Adopt refiner assay | 2 |
| `741:46678` Item Row / Refiner · proposed | 25 |
| `741:47884` Lots / Refiner · proposed | 4 |
| `742:20760` Settlement · proposed | 4 |
| `743:20841` Settlement · proposed / Mobile | 4 |

### `688:34720` Draft · Customer · 2026-09-12 — delete

Jacob removed `Customer · Sell` and every other `Customer · *` page. Rule (c)
of the brief applies: the Sell page is gone, so its stragglers go. All three
components have **zero instances anywhere in the document** (verified across
all six pages):

| id | type | name | instances | verdict |
|---|---|---|---|---|
| `694:35764` | COMPONENT | Product Card · customer | 0 | **delete** |
| `694:35775` | COMPONENT | Spot Card · customer | 0 | **delete** |
| `694:35833` | COMPONENT | Order Summary · customer | 0 | **delete** — the sell-review / cart / checkout aside |
| `688:34720` | SECTION | the section itself, once emptied | — | **delete** |

---

## 3 · Page `Proposal · positions` `618:4459`

This is the old `Orders & Lots` page. Jacob moved his own work off it and
renamed it after our section.

| id | type | name | whose | instances | verdict |
|---|---|---|---|---|---|
| `638:13010` | TEXT | Proposal · positions | ours | — | **delete** — stray section label; the page now carries the name |
| `638:13011` | FRAME | Proposal note · the model and what changes | ours | — | **delete** — note; verbatim in `orders-lots-proposal.md` §1, which it cites |
| `639:13959` | SET | Lot Row (proposal) | ours | 8 on `645:13069` | keep |
| `640:13045` | SET | Order Card (proposal) | ours | 6 on `644:12690` | keep — see the follow-up note below |
| `641:14984` | SET | Selection Bar (proposal) | ours | 1 on `644:12690`, 1 on `645:13069`, **2 on page `Inventory`** | keep |
| `642:12662` | SET | Inventory (proposal) | ours | 4 on `645:13069`, **16 on page `Inventory`** | keep |
| `643:12678` | COMPONENT | Source Control (proposal) | ours | 0 | keep — deliverable, `orders-lots-proposal.md` §2/§4 |
| `643:12699` | COMPONENT | Payout Timing (proposal) | ours | 0 | keep — deliverable, same |
| `644:12690` | FRAME | Admin / Orders — proposal | ours | — | keep — the order-grain Batch screen Jacob approved (§3.1) |
| `644:13520` | TEXT | Proposal screen 1 caption | ours | — | keep — captions a live frame |
| `645:13069` | FRAME | Admin / Inventory — proposal | ours | — | keep — the Inventory drafts build on it |
| `645:13781` | TEXT | Proposal screen 2 caption | ours | — | keep |
| `656:15023` | COMPONENT | Page Header | ours | **3 on page `Inventory`, 5 on page `Pool`** | keep |

**The page is not collapsible into `Components`.** The brief allows folding the
proposal cluster into a `Proposal · components` section and deleting the page
*if the page ends up holding only referenced components*. It does not: it also
holds two live screens (`644:12690`, `645:13069`) and their captions, and eight
of its component instances live on the two pages now being ported. The page
stays.

**Follow-up, not a delete.** `644:12690` still instantiates `Order Card
(proposal)` `640:13046`, which carries the two footer lines Jacob cut (the
payout-gate reason and the lots-by-position summary, `orders-screens.md` §3).
The newer `Order Card · proposed` `671:28586` is the corrected card. Refreshing
that screen is a drawing job, not a cleanup job.

**Superseded but still load-bearing.** Both proposal screens now wear the
library `Admin Header`, not `Page Header` `656:15023` — `customers-leads-screens.md`
records the swap. `Page Header` survives only because the Inventory and Pool
drafts still use it.

---

## 4 · What the Inventory and Pool drafts instantiate from elsewhere in this file

**For the port agent and Jacob: each of these must exist in the new Inventory
and Pool files before those drafts can leave, or the instances break.**

| component | id | lives on | used by `Inventory` `660:10614` | used by `Pool` `660:10615` |
|---|---|---|---|---|
| `Page Header` | `656:15023` | Proposal · positions | 3 | 5 |
| `Inventory (proposal)` — `Metal=All,false` `642:12663`, `Gold,true` `642:12681`, `Silver,false` `642:12687`, `Platinum,false` `642:12699` | `642:12662` | Proposal · positions | 4 each (16) | — |
| `Selection Bar (proposal)` — `Selection=On hand` `641:14854`, `Mixed positions` `641:14880` | `641:14984` | Proposal · positions | 1 each (2) | — |
| `Filter Bar (proposal A)` — **Jacob's** | `626:11861` | Components › Orders · list | 3 | — |
| `Totals` — **Jacob's** | `152:1187` | Components › Orders · order screen cards | 24 (+1 inside `Draft · Inventory`) | — |
| `Lot Row` — **Jacob's**, on his own frame `620:6474` | `619:4869` | Components › Inventory · lots | 8 | — |

`Lot Row (proposal)` `639:13959` is **not** used by the Inventory page — the
Inventory table uses the local copy `Lot Row` `724:17677` inside
`Draft · Inventory` (`inventory-pool-screens.md`, "Three rules from 2026-09-12"
§2), which travels with the section. Everything else the two pages use is
inside `Draft · Inventory · 2026-09-11` or `Draft · Pool · 2026-09-11` and
moves with them.

---

## 5 · After the port — candidates held back

Deletable in principle, held because they are doc deliverables whose screens
Jacob moved to their own pages or files. **Confirm the components were carried
across before any of these goes.**

| id | section | components | screen instances left in this file |
|---|---|---|---|
| `688:35714` | Draft · Customers · 2026-09-12 | 11 | 0 — the `Customers` page is gone |
| `688:35715` | Draft · Leads · 2026-09-12 | 5 | 0 — the `Leads` page is gone |
| `689:33339` | Draft · Rates · 2026-09-12 | 7 | 0 — the `Rates` page is gone |
| `689:33340` | Draft · Spots · 2026-09-12 | 7 | 0 — the `Spots` page is gone |

Every instance of these thirty components is internal to its own section (a
badge nested in a row, a row nested in a card). Nothing on any surviving screen
uses them.

Also held: the `Inventory` and `Pool` pages and the `Draft · Inventory` /
`Draft · Pool` sections, plus everything in §4 that they instantiate.

---

## 6 · Jacob's candidates — listed only, nothing touched

| id | where | what | why it is a candidate |
|---|---|---|---|
| `660:10617` | page `Archive` | five sections of superseded work | `661:15023` Dashboard components · unplaced (5 sets, 0 instances) · `661:15024` superseded Lots variants (5 components, 0 instances) · `661:15025`–`661:15027` three stray `Components` / `Screens` labels and one empty 100×100 `Frame 1` `621:12036`. Nothing in the file references any of it. |
| `291:9181` | page `Orders` | TEXT `States · how to swap` | a working note beside his order screens; superseded by the `Order State` set `664:12789` if he agrees |
| `626:11861` | Components › Orders · list | `Filter Bar (proposal A)` | our `Filter Bar · proposed` `715:38985` is the newer draft, but his is still instantiated 3× on the Inventory page — cannot go until the port lands |
| `619:4942` | Components › Inventory · lots | `Unassigned Card` | 0 instances; `orders-lots-proposal.md` §2 replaces it with `Inventory (proposal)` `642:12662` |
| `618:4497` | Components › Inventory · lots | `Lot Tile` | 0 instances; the tile view is not drawn on any surviving screen |
| `619:4639` `619:4750` | Components › Orders · list | `Filter Rail`, `Order Context Menu` | 0 instances on any screen |

---

## 7 · Executed

Screenshots of all six pages taken before and after.

| page | deleted | reason |
|---|---|---|
| Orders `660:10613` | `673:35312`, `673:35313` | notes already in the docs |
| Proposal · positions `618:4459` | `638:13010`, `638:13011` | stray label; note already in the docs |
| Components `660:10616` | `694:35764`, `694:35775`, `694:35833`, then section `688:34720` | zero instances; every `Customer · *` page, Sell included, is gone |
| Inventory `660:10614` | — | held, port in flight |
| Pool `660:10615` | — | held, port in flight |
| Archive `660:10617` | — | his |

Seven nodes. Everything else our agents drew is either instantiated by a live
draft, named as a deliverable by a doc, or held for the Inventory/Pool port.

### Verification

| check | result |
|---|---|
| Broken instances, all six pages | **0** |
| Instance total, page `Orders` | 1,976 before → **1,976** after |
| Instance total, page `Proposal · positions` | 404 before → **404** after, every local reference unchanged |
| Instance total, page `Components` | 3,562 → **3,540** — exactly the 22 library instances that lived inside the three deleted customer components |
| Section child counts, page `Components` | 35 · 5 · 4 · 14 · 15 · 4 · 11 · 5 · 7 · 7 — every surviving section unchanged |
| `Draft · Orders · 2026-09-11` | all 14 sets present and still instantiated |
| Horizontal overflow, every draft screen | **0** |
| Pages `Inventory`, `Pool`, `Archive` | renders **byte-identical** before and after (md5 match on all three) |

`get_metadata` spot-checks, instances all resolving: `729:36280`,
`721:17087`, `743:39626` (Orders) and `644:12692`, `645:13071` (the two
proposal screens — both confirmed now carrying the library `Admin Header`).

Side effect worth noting: the `Components` page's rendered canvas shrank from
65,727px to 48,018px tall. The deleted `Draft · Customer` components were
sitting far below every other section, so the page now ends at the foot of
`Draft · Spots`.
