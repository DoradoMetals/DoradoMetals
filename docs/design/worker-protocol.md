# Figma worker protocol

Every design worker (one per file) follows this. It lived in the session scratchpad until 2026-10-13, when /tmp was wiped; it lives here now.

## Files

Orders `ymmNlCDLVIfanpRQ7QHMIs` · People `5cEytffOkxIfqdRWFaTWpl` · Pricing `FdBKQiTCRJNS3uJeD1n5zd` · Inventory `ZgJF9JWNY6BwxmWABRZ6I7` · Media (emails + PDFs) `WkbKhVaAYmxKTsbmAQEwmk` · Auth `hZ5Ajr9Hn1h2Q2XFRa1NYY` · Admin (overview) `RAmZ5RfxfW3sE9oM4uuhor` · Library "Themes and Components" `8A73quhBLBqotJlX95jN9j` (read-only for file workers; asks are pinned there; only Jacob publishes).

## Loop

- Poll comments every 30 s as a background timer task (`run_in_background: true`; its completion re-invokes the worker; a foreground sleep is blocked). After 15 quiet minutes poll every 300 s; back to 30 s on a new comment. Keep the high-water mark on disk, never a retyped timestamp.
- Replies go out as the bot (REST, `FIGMA_BOT_TOKEN`; reads use `FIGMA_TOKEN`; both loaded by the script, never printed). One or two sentences. Node references only as links inside plain English sentences, one link per sentence, id read back from Figma first; never bare ids or URL lists.
- Hit-test every pin against `node_offset` before acting; the words win over the pin. Jacob edits live: re-read structure every pass, never cache ids or child lists across a poll.
- Report to the orchestrator only on a finished job or a ruling that changes scope.

## Rules Jacob has set

- Tokenize everything: every gap, padding, radius, stroke, size (where a size token exists), colour and text style binds to a library variable or style. A needed token is added to the library collection first, never hardcoded. Library scale: spacing with half steps (2xs+ 6, xs+ 10, sm+ 14, md+ 20), radius/md 6, control/xs 24 · sm 32 · sm+ 36 · md 40 · lg 44 · xl 48, page/margin-letter 72 (documents; never round to 64), opacity tokens are percentages.
- Hug and fill, not fixed: children in auto-layout use HUG or FILL with tokenized or SPACE_BETWEEN gaps; FIXED only on screen frames, viewport regions and token-bound control sizes. Tables: row FILL, name column FILL, numeric columns fixed, header identical to rows (the plugin API's GRID exposes only a column count, so proportional tracks are impossible).
- Two-line rows are for items and entities; ledgers, logs, histories and audit trails are records and get real tables with aligned columns. "One card per thing" governs entities, never records.
- One base screen per page while iterating, components in their own frame; no extra states, mobile twins or entity pages until Jacob says the design is heading to finalization. Superseded screens are deleted on his word, not parked; version history is the undo.
- No radio icons; Admin Header on list pages only; one component per thing; no deleting anything Jacob drew without his explicit word.

## Safety

- Snapshot to disk before any batch write (ids, bindings, counts).
- Tripwire around every batch: compute the EXACT predicted node delta and assert it; a structural guard that COMPONENT, COMPONENT_SET and SECTION counts never decrease unless the batch is a deletion script with its id list on disk. One change per batch. Resolve the target mains first and SETTLE every page count (read until two consecutive reads agree) before baselining: Figma materialises nested instance subtrees lazily, and a "delta" the size of a nested main is lazy loading, not loss. Never `remove()` inside a sweep.
- Swap is not a clean slate: `swapComponent` carries every override from the old main; `resetOverrides()` then re-apply only the real data, then diff instance vs main property by property as a standing check.
- Clone trap: after `.clone()` the nested instance subtree is not enumerable until settled. `setBoundVariable(field, null)` leaves the number as a literal; the undo is `node.field = null`. `textTruncation` needs the font loaded.
- A sweep counts missing binds, not wrong values: render to see (opacity tokens stored as fractions painted hover at 0.85 percent; black-on-black glyphs). Cross-read any banner against any list on the same screen. Detectors lie in both directions: guard them before believing a count.
- After a library publish: clear explicit height overrides on placed Button and Icon Button instances (an instance ever given a height keeps drawing the old box) and re-render Hover states.

## Code lanes porting a design (2026-10-14, Jacob)

The designs are the business source of truth. The api and the frontend match them. A lane that leaves out anything a design shows (a field, a state, a control, a screen, a column) names it in its report with the reason, and the orchestrator surfaces it to Jacob; omission is the exception and is never silent. The same holds the other way: anything in code that no design shows is listed as code-only.

## Code lanes and new UI (ruling 154, 2026-10-16, Jacob)

A code lane never invents UI. When it needs a state, control, card, row or
screen the frames lack, it asks that file's Figma worker (through the
orchestrator), the worker draws it from Library components and pins a comment
on the node marked "NEW: asked by the <lane> lane, not yet approved", and the
code lane builds it only after the worker reports the node ids. Jacob's
approval is not required before building, only the comment; he vetoes on the
pin. "Code-only" never appears in a lane report as a settled state.

## Payments file (2026-10-16)

Payments `GPSOCeWTjc7pDsQBs4gFt4` is the eighth file. It holds the bank link component (Purpose: Payout | Payment) and the Payout Accounts screen moved from People. Tooling: `tools/payments/`; log: `docs/design/payments-comments-log.md`; polled by `tools/all/loop.sh`.
