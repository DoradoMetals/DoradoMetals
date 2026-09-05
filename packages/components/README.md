# @dorado/components

The component library: the code half of the Figma "Themes and Components" file,
one component per directory. Ships SOURCE, not a build. The frontend transpiles
it and typechecks it as part of its own program, so there is no dist to drift.

The sources carry no comments (Jacob, 2026-09-03). Everything a header comment
used to hold lives here instead.

## House rules

- **Tokens, never magic numbers.** Type comes from the theme ramp
  (`text-micro`, `text-small`, `text-body`, `text-h1`..`text-h6`,
  `text-display`, `text-stat`), colour from the semantic names, radius from
  `rounded-sm`/`md`/`lg`/`surface`. There is not one raw `text-sm` or
  `text-[13px]` left in this package, and it should stay that way.
- **The call-site rule.** Layout belongs to call sites: flex placement, gap
  between siblings, margin, `w-full`. Appearance belongs to the component:
  colour, type, border, radius, hover. A call site cancelling a hover is a bug
  report about the component.
- **Do not size an icon inside a Button.** Button tiers its own icons with its
  size, 14/16/20 for SM/Default/LG. A `size-4` on the glyph is dead code that
  loses to the tier on specificity while looking authoritative.
- **Hallmarks the drawing cannot express** are real requirements: focus-visible
  rings, keyboard handling, aria, `prefers-reduced-motion`, the `cn()` merge.
  A drawing showing no focus ring is not permission to delete one.

## Figma node ids

Audited 2026-09-03 against file `8A73quhBLBqotJlX95jN9j`.

| Component | Node | Component | Node |
|---|---|---|---|
| Accordion | 32:36 | Marquee | 170:48 |
| AddressCard | 163:32 | MaskedField | 170:89 |
| Alert | 54:44 | Menu | 132:19 |
| Attachment | 40:54 | OTPInput | 96:32 |
| Autocomplete | 100:29 | Progress | 132:995 |
| Avatar | 32:147 | QuantityStepper | 132:1016 |
| Badge | 32:83 | ScrollArea | 306:38 |
| Button | 25:510, usage 479:155 | Select | 38:75 |
| Calendar | 49:100 | Skeleton | 32:155 |
| Chart | 57:2 | Slider | 31:115 |
| Checkbox | 15:16 | SliderField | 99:210 |
| Chip | 32:121 | Spinner | 32:191 |
| DataTable | 56:82 | Stat | 53:39 |
| DatePicker | 104:438 | Stepper | 54:74 |
| Dialog | 41:55 | Carousel | 59:63, Swiper usage 626:3 |
| EmptyState | 127:49 | Switch | 17:14 |
| Field | 106:213 (Figma page calls it Popover, renamed 2026-08-31) | Table | 56:82 |
| Hero | 163:35 | Tabs | 39:23 |
| Input | 26:391 | Textarea | 37:63 |
| Link | 26:513 | Tooltip | 32:177 |
| List | 97:35 | Upload | 349:340 |
| Paperwork | 549:63 | Tracker | 597:108 |
| Footer | 76:177 | Header | 51:58 |
| Radio | 15:27, Tile 31:59, Chip 31:78, Card 99:119 | | |
| Amount | 612:12 | Banner | 125:4 |
| Divider | 431:15 | Drawer | 127:32 |
| Pagination | 132:966, Page Item 132:965 | | |

Chart's five sub-drawings: Bar 57:36, Line 57:60, Area 140:961, Donut 140:964,
Sparkline 140:968.

Three of these were wrong before this audit and cost real time to rediscover.
Link was recorded as 6:307, which no longer resolves. Textarea was recorded as
37:2, which is the CANVAS, not the component, so `get_design_context` fails on
it every time. Select and ScrollArea had no id at all.

**TimePicker has no node of its own any more.** 55:50 is gone; the component was
folded into Datepicker on 2026-09-02, and the embedded time-slot markup inside
104:438 is now the only spec for it.

**Toaster is GONE** (Jacob, 2026-09-03: "Remove Toaster, we don't have it any
more"). It had no drawing: the library has no Toast or Toaster page at all, which
is why its recorded node never resolved. The component, its test and the `sonner`
dependency are deleted, and the only consumer was the root layout.

**TimePicker is no longer a public component.** Its Figma node was folded into
Datepicker on 2026-09-02, so the code follows: the file stays as an internal of
DatePicker, and only the `TimeGroup` and `TimeSlotShape` types are still exported,
because DatePicker's own props take them.

Tracker composes Tracker Step (542:1417) and Tracker Node (541:14); Paperwork
composes Paperwork Row (548:41). Both keep their row components internal.
ScrollArea composes Scrollbar (320:16) the same way.

**Tracker was recorded at 546:10, which is now the Orientation=Vertical variant
only.** The audited node was renamed/promoted 2026-09-04: 597:108 is the actual
Tracker component with an Orientation axis (Vertical/Horizontal), and 546:10's
own description is now just "Orientation=Vertical" - identical content, narrower
scope. REVISED 2026-09-04 (Jacob): Horizontal was REBUILT as a single rail -
markers evenly spaced, first flush left and last flush right, connectors filling
between them, text in one block under each marker (ends aligned outward, middles
centred). Code had no Horizontal orientation at all before this pass; it now
takes `orientation="horizontal" | "vertical"` and renders the rail via the same
per-step colour law as Vertical (a stage's own state colours the connector
leaving it; the next stage's left half is the same colour). "Pending" for an
unscanned location and an em dash for its time apply on both orientations now.

## Known defects in the Figma file, not in this code

- **Attachment's (40:54) `Layout=Row`/`Layout=Card` overlap is FIXED, not
  outstanding.** This entry previously said the three Row variants (343:2,
  343:11, 343:20) sat on top of the three Card ones (40:19, 40:36, 40:53) and
  drew every label twice. Verified 2026-09-04 against a fresh pull: the
  component's own description now says "LAYOUT FIXED 2026-09-03: ... Card is
  now the left column, Row the right, states down the rows." Nothing in code
  changed because nothing in code was wrong; the canvas caught up.
- **Attachment's remove icon is FINE, and a first reading said otherwise.**
  Every variant's remove button sets `Leading icon` to 226:12, which resolves to
  `trash-2`. The layer is merely still NAMED `arrow-left`, inherited from
  Button's default icon slot, and the design-context output shows that stale
  layer name rather than the swapped component. Renaming those six layers would
  stop the next audit making the same mistake.
- **The Hero headline entry above is stale; it was fixed 2026-09-03.** This
  used to say the headline was typed raw at 44px against Display's 64px.
  Jacob's own call ("change the hero") landed it on Heading/H1 (36px) instead -
  "every text node in the file is now on a ramp style." Code carried a
  `sm:text-display` escalation left over from the old assumption; removed
  2026-09-04, headline is `text-h1` at every size now.
- **Hero's column gap and frame padding read as off-token in prose that the
  frame itself no longer matches.** The description still says gap 20 (Scale
  has md 16, lg 24) and frame padding 96 (Scale stops at 3xl 64), but the
  current frame's own layer values are `spacing-md` (16) and `spacing-3xl` (64)
  - both real tokens. Code had literally been written to the STALE numbers
  (`gap-5`=20, `sm:p-24`=96); fixed 2026-09-04 to `gap-md` and `sm:p-3xl`.
- **Hero's eyebrow is described as "a bordered pill (Badge outline language)"
  but both the frame and the code render Badge's default Soft treatment** (a
  translucent fill, no border). Resolved in favour of the frame + code, which
  agree with each other; the prose is what's stale.
- **Two descriptions disagree with their own frames.** EmptyState's says a 32px
  glyph where the frame measures 64px; Link's says a 10px icon where the frame
  measures 12px. Both were resolved in favour of the frame.
- **Chip's description mentions a 7px X**, which matches no token and no
  rendered geometry. Treated as stale prose.
- **Dialog's (41:55) drawn "Cancel" button is bordered - Secondary's box, not
  Tertiary's bare text - while the description calls it "Tertiary/Neutral to
  dismiss."** Not a code issue: `DialogFooter` is a layout shell and the
  buttons inside it are call-site composition, so there is nothing here to fix
  against a contradiction in the drawing itself. Reported, not guessed.
- **Dialog Overlay's (64:517) own layer values contradict its own prose.** The
  description says an 8px blur over a 70% background scrim, but the raw frame
  bakes in `backdrop-blur-[4px]` and a fully opaque `bg-background` with no
  alpha at all. Code is written to the PROSE (8px / 70%), which is also the
  more specific, dated, and internally consistent of the two - the frame reads
  like it predates a later blur-radius correction that never got re-drawn.
- **Icon Button's (457:75) Default size doesn't balance.** SM checks out - a
  32px box, 8px padding each side, 16px icon, 8+16+8=32. Default does not: a
  40px box with the drawn 12px padding (spacing/sm) leaves only 16px for an
  icon the description says is 20px - 12+20+12=44, four pixels over the frame.
  Either the padding token or the icon size is wrong in Figma; not reachable
  from a padding-based read, so Button's `icon`/`iconSm` cva sizes were set
  from the description's plain-language sizes (SM 16, Default 20) rather than
  back-computed from the padding.
- **Menu Item's (132:18) drawn hover fill uses `--secondary`, not `--accent`.**
  Every other "quiet hover" surface in this file and in this codebase (Field's
  option, Table's row, Chip, Calendar, Accordion, tertiary Button) uses
  `--accent`, and Menu Item's own prose says "same quiet-hover language ... as
  tertiary Button." `--secondary` and `--accent` happen to be the same hex
  today, so nothing renders wrong yet; treated as a stale colour pick in the
  frame rather than a reason to introduce the only `bg-secondary` hover in the
  package.
- **Breadcrumb's (126:16) description claims "Code counterpart exists
  (base/breadcrumb)."** Searched the whole repo; no such file exists anywhere,
  under any name. Breadcrumb has no code counterpart - see below.

## The library cannot absorb the app yet

The frontend sweep on 2026-09-03 tried to replace local components with library
ones and mostly could not. Five agents reported the same handful of gaps, so
these are the specification for the next round of library work rather than one
agent's opinion.

- **`Input` sets `text-body`, which is 15px, and iOS Safari zooms the viewport
  when a focused input is under 16px.** The app's local input uses 16px on
  purpose and says so in its own comment. This is a platform behaviour, not a
  look, and it blocks every Input and Textarea swap in the app. It needs a
  decision: hold 16px on touch devices, or accept the zoom.
- **`Input` and `Textarea` own their wrapper.** The library renders a bordered
  box plus an optional label, so a call site's `className` lands on the wrapper
  rather than the control. The app has many dense inline fields that put sizing
  straight on the element.
- **`EmptyState` has no `badge`, `description` or `iconSize`.** Every call site
  in the app uses at least one.
- **`Badge` has no size axis and is `rounded-md`.** The app's status labels are
  pills with a size axis, deliberately, under an existing ruling.
- **`Table` always draws its own card and border**, and has none of the app's
  `surface`, `borderless`, `interactive`, `intent` or `disabled` row props.
- **`DataTable` is far thinner than the app's**, which carries filter cards,
  search, row click and column visibility.
- **Nothing exists for** drawer, form, separator, popover, rating, command,
  lens, radio group, pagination or breadcrumb. Figma has pages for Divider,
  Drawer, Radio, Pagination and Breadcrumb, plus Banner, Icon Button and
  Loader, none of which is built.

Two smaller ones found the same day: `FloatingLabelInput` and
`FloatingLabelTextarea` in the app reference `text-error` and `border-error`,
which are not tokens and never have been, so their error state has always
rendered as nothing. And the app's mobile nav scrim uses raw `black/15` because
the theme has no overlay or scrim token.
