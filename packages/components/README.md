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
| Dialog | 41:55 | Swiper | 59:63 |
| EmptyState | 127:49 | Switch | 17:14 |
| Field | 106:213 | Table | 56:82 |
| Hero | 163:35 | Tabs | 39:23 |
| Input | 26:391 | Textarea | 37:63 |
| Link | 26:513 | Tooltip | 32:177 |
| List | 97:35 | Upload | 349:340 |

Chart's five sub-drawings: Bar 57:36, Line 57:60, Area 140:961, Donut 140:964,
Sparkline 140:968.

Three of these were wrong before this audit and cost real time to rediscover.
Link was recorded as 6:307, which no longer resolves. Textarea was recorded as
37:2, which is the CANVAS, not the component, so `get_design_context` fails on
it every time. Select and ScrollArea had no id at all.

**TimePicker has no node of its own any more.** 55:50 is gone; the component was
folded into Datepicker on 2026-09-02, and the embedded time-slot markup inside
104:438 is now the only spec for it.

**Toaster's node is unknown.** 132:1041 does not resolve and no search finds it.
Its audit is outstanding.

## Known defects in the Figma file, not in this code

- **Attachment (40:54) is damaged.** Its three `Layout=Row` variants (343:2,
  343:11, 343:20) sit at exactly the same x and y as the three `Layout=Card`
  variants (40:19, 40:36, 40:53), so the frame renders every label twice and
  looks bolded. The variants are correctly named and their specs read fine
  individually, so the code is right; the canvas is what needs fixing.
- **Attachment's Row remove button carries the wrong icon.** It instances
  `arrow-left` where Card instances `trash-2`, contradicting the component's own
  description ("the remove affordance is a TRASHCAN, not an X"). Almost
  certainly a duplicate whose icon swap reset to Button's default. The code
  follows the description and uses the trashcan.
- **The Hero headline is not bound to a text style.** It is typed raw at 44px
  while the Display style, which names `--text-display` outright, is 64px.
- **Two descriptions disagree with their own frames.** EmptyState's says a 32px
  glyph where the frame measures 64px; Link's says a 10px icon where the frame
  measures 12px. Both were resolved in favour of the frame.
- **Chip's description mentions a 7px X**, which matches no token and no
  rendered geometry. Treated as stale prose.
