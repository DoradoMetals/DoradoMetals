# History

Finished work. Nothing here describes the codebase as it is today. Keep it
for the record, for `git blame`, and for the numbers that cannot be
re-derived.

| file | what it is |
|---|---|
| `FOLLOWUPS-2026-09-07.md` | the full 16,356-line running record, D1 to the API review. The open items left it for `FOLLOWUPS.md`; the standing rulings left it for `docs/rulings.md`. |
| `PROMOTION.md` | the promotion runbook for the `*_SOURCE` switches. Every switch is deleted. Its production sequence is superseded by `docs/waves/production-chain.md` (ruling 82 added a reset step and folded the backfills into `migrate`). |
| `WAVES.md` | the wave progress board. Its percentages stopped tracking reality; `docs/waves/handoff-2026-09-07.md` is the current picture. |
| `MERGE-NOTES-ds-update.md` | merge notes for the design-system update. Merged. |
| `migrate-feature-schema-SKILL.md` | the skill that moved one feature at a time from `exchange` to the domain schemas. That migration is finished: no code reads or writes `exchange`. |
| `waves/` | finished lane logs. |

## `waves/`

| file | what it recorded |
|---|---|
| `boundary-feature.md` | migration 128, the handover columns |
| `checkout-items-shape-changes.md` | ruling 50, the cart becomes checkout items |
| `contracts-shape-changes.md` | the contract shapes a batch changed |
| `handoff-2026-09-06.md` | superseded by `handoff-2026-09-07.md` |
| `packing-list-nan.md` | the NaN on three packing lists was label image bytes |
| `phase10-design-system.md` | the component library and theming pass |
| `phase5-fast-gate.md` | `scripts/check.mjs` and `check:fast` |
| `phase7-money-at-rest.md` | the AES-256-GCM envelopes for payout details |
| `prettier.md` | the commit hook and the one-time format |
| `pricing.md` | rulings 75/76/78, one pricing domain |
| `production-day-fixes.md` | 047, 049, 094 and 133 made safe for a from-nothing build |
| `profit-sql.md` | `profitBreakdown` becomes one SQL read |
| `purge.md` | D212, the removal of all legacy code |
| `seams.md` | the seam inventory of the migration era |
| `views.md` | rulings 71/73, views are SQL |
| `wave-5b.md` | an early migration wave |
| `write-pivot.md` | **the covenant ledger, taken before `exchange` stopped being written.** 15 table pairs, 10 byte-identical, `only_in_target` zero on all fifteen. It cannot be re-derived: both sides are frozen now, so `verify:parity` compares two still tables. |
