# Admin Header — tab set

Figma library **Themes and Components**, file key `8A73quhBLBqotJlX95jN9j`, page **Admin Header**.

## Components touched

| Component | Node id | Key |
|---|---|---|
| `Admin Header` (desktop) | `730:8` | `75e3f5a3312c5851c39dca60175870b1ef86ae6e` |
| `Admin Header / Mobile` | `734:269` | `281d04665d8742d8f161f25a09e3fe69bdfdffed` |

Both are plain `COMPONENT` nodes, not component sets. The tab row is a `Tabs`
auto-layout frame (`747:330` desktop, `747:331` mobile), horizontal, gap 4, HUG
on both axes.

## What changed

The tab row now reads, in order: **Orders, Inventory, Pool, People, Rates, Spots.**

Each tab is an instance of the `Tab` component set (`39:23`), which carries a
text property `Label#39:0` and a variant property `State`. Labels were set
through `setProperties`, never by editing the text layer, and the layer name of
each tab was set to match its label.

Desktop (`Tabs` = `747:330`):

| Slot | Node id | Before | After |
|---|---|---|---|
| 1 | `730:38` | Orders (Active) | Orders (Active) — unchanged |
| 2 | `730:42` | Inventory | Inventory — unchanged |
| 3 | `730:46` | People | **Pool** |
| 4 | `730:50` | Accounting | **People** |
| 5 | `766:329` | — | **Rates** (new, cloned from slot 4) |
| 6 | `766:333` | — | **Spots** (new, cloned from slot 4) |

Mobile (`Tabs` = `747:331`): the same six, `734:294` Orders (Active),
`734:298` Inventory, `734:302` → Pool, `734:306` → People, `766:2175` Rates
(new), `766:2179` Spots (new).

Nothing else was touched: chip slots, breadcrumb, search, action button,
toolbar, radio group, selects, reset, counts, spacing, padding and all token
bindings are as they were. No width was set by hand — `Tabs` HUGs and absorbed
the two extra tabs.

## Variants

There is **no** `Selected` variant on `Admin Header` itself, so no variant set
needed extending. Selection lives on each tab instance, through the `Tab`
component set:

- `Tab` (`39:23`) — `State` = `Default` | `Hover` | `Active` | `Disabled`
- `Label#39:0` — TEXT, default `Bullion`

Any one of the six tabs can therefore be made the selected tab on an instance by
setting that tab's `State` to `Active`. The shipped default keeps `Orders`
active on both components.

The header's own component properties are unchanged, desktop:
`Title`, `Description`, `Count`, `Show nav`, `Show breadcrumb`, `Show chips`,
`Show chip 3`, `Show chip 4`, `Show description`, `Show search`, `Show action`,
`Show toolbar`, `Show radio`, `Show select 3`, `Show select 4`. Mobile carries
the same fifteen under its own ids.

## Fit

- **Desktop.** `Tabs` grew 320 → 405 px. `Nav` (`730:9`) is 1376 wide with 24 px
  left and right padding, so 1328 px is available. Fits with 923 px to spare.
  Component height is unchanged at 254 px.
- **Mobile.** `Tabs` is the same 405 px but `Nav` (`734:270`) is 358 wide with
  16/16 padding — 326 px available. Six tabs overflow by 79 px, and the frame
  clips, so `Spots` was cut off. `Nav.overflowDirection` was set from `NONE` to
  `HORIZONTAL`, which makes the tab row a horizontally scrolling strip — the
  normal mobile tab-bar behaviour. No width, spacing or token was altered to
  achieve it. **Flag for Jacob:** this is the one change outside the tab list.
  If a scrolling strip is not wanted, the alternatives are a shorter label set,
  smaller tab padding, or a mobile overflow menu — all need a design call.

## Held / not done

- **Instances did not update.** The admin screens in the Orders file
  (`ymmNlCDLVIfanpRQ7QHMIs`) instantiate the *published library* version —
  `mainComponent.remote === true`. Seven instances still show the old four
  tabs: `687:13885`, `687:14124`, `687:14247`, `687:14389` (page Orders),
  `689:33108` (page Inventory), `680:15002`, `680:15238` (page
  Proposal · positions). They will pick up the six tabs once the library is
  published from the Figma UI, which is a manual step. No instance was edited.
- **Frame `168:2022` on the Orders file holds no Admin Header.** It is
  `Admin / Purchase Order — PO-2481 (Desktop)` and its header is the marketing
  `Header` component (`168:2023`, 1440×64). The desktop instance used for
  verification was `687:13885` inside `Admin / Orders & Lots` (`620:5115`).
