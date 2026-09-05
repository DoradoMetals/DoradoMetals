# Domains restructure (ruling 77)

Jacob, 2026-09-05: "while the DB should be by schema, I don't think our feature
code should be. Let's also reunify transport/domain under one folder again."

`api/domain/` and `api/transport/` dissolve into nine domain folders directly
under `api/`. `api/db/<schema>/<table>` stays by schema. `shared/`,
`providers/`, `scripts/`, `migrations/`, `tests/`, `types/` do not move.

## The map (every current folder has exactly one destination)

| domain | from `domain/` | from `transport/` |
|---|---|---|
| `logistics/fulfillments/` | fulfillments (drafts, rules, methods/, pickups/, directs/, shipments/, tests/) | fulfillments (routes, controller, directs/, methods/, pickups/) |
| `logistics/shipping/` | shipping (rules, labels, carriers/, services/, packages/, handoffs/, shipments/, tracking/, operations/, pickups/, tests/) | shipping (routes, carriers/, handoffs/, operations/, packages/, services/, shipments/) |
| `pricing/` | pricing (service, index, profit, rules, tests/) | pricing (routes, controller) |
| `pricing/rates/` | rates | rates |
| `pricing/spots/` | spots | spots |
| `pricing/metals/` | metals | metals |
| `pricing/sales-tax/` | sales-tax | — |
| `orders/` | orders (service, place, read, rules, addresses/, spots/, transactions/, tests/) | orders (routes, creates.routes, controller, addresses/, items/, spots/, tests/) |
| `orders/refiners/` | refiners (items/, orders/, spots/, tests/) | refiners (items/, orders/, spots/) |
| `checkout/` | checkout | checkout |
| `payments/` | payments (service, sweeps, rules, details/, methods/, tests/) | payments (routes, controller, details/, methods/) |
| `payments/transactions/` | transactions (the credit ledger) | transactions |
| `catalog/products/` | products | products |
| `catalog/mints/` | mints | mints |
| `crm/leads/` | leads | leads |
| `crm/reviews/` | reviews | reviews |
| `identity/auth/` | auth | auth |
| `identity/authorization/` | authorization | — |
| `identity/users/` | users | users |
| `identity/places/` | places (addresses/, lookup/) | places (addresses/) |
| `identity/recaptcha/` | recaptcha | recaptcha |
| `media/images/` `media/emails/` `media/pdfs/` | media/* | media/* |

Transport files land BESIDE the service they serve: `transport/orders/routes.ts`
becomes `orders/routes.ts`, `transport/fulfillments/methods/routes.ts` becomes
`logistics/fulfillments/methods/routes.ts`. Filenames do not change. A test
folder that exists on both sides merges into the one `tests/`; a colliding test
filename gets the prefix `http-`.

Two calls already made: refiners sit under orders until the lots model gives
them a home; places sits under identity because the address book is the user's.
The users' credit functions (`identity/users/service.ts`) belong to payments and
move in a later pass, not this one.

## Imports

`package.json` `imports` drop `#domain`, `#domain/*`, `#transport/*` and gain:

```
"#domains": "./domains.ts"          the barrel, was domain/index.ts, same namespace names
"#logistics/*": "./logistics/*"
"#pricing/*": "./pricing/*"
"#orders/*": "./orders/*"
"#checkout/*": "./checkout/*"
"#payments/*": "./payments/*"
"#catalog/*": "./catalog/*"
"#crm/*": "./crm/*"
"#identity/*": "./identity/*"
"#media/*": "./media/*"
```

Every importer follows (`app.ts`, `shared/cron/scheduler.ts`,
`shared/middleware/authMiddleware.ts`, `shared/testing/*`, `scripts/*`,
`tests-external/*`). Nothing relative crosses a root.

## The layout has ONE source of truth: `scripts/lib/layout.ts`

Jacob: "Should be a way to do this without a hardcode." No lint, config or
script lists the domain folders by hand.

- `domainDirs(root)` reads `<root>/package.json` `imports` and returns the
  wildcard roots that are not `db`, `shared`, `providers` (so a new domain is
  one `imports` line, and every check sees it).
- `isTransportFile(rel)` is true for `routes.ts`, `*.routes.ts`,
  `controller.ts`. That is the role the old `transport/` folder encoded; the
  lints that treated the two folders differently now split by role, not path.
- `vitest.config.ts` builds its alias list from the same `imports` map (exact
  and wildcard) instead of its hand list, and its coverage threshold keys from
  `domainDirs()`.

## Every check that assumed the two folders

| script | change |
|---|---|
| `lint-domain-boundaries` | lane dirs `checkout`, `orders`, `logistics/fulfillments`; exception-table paths |
| `lint-pricing-owner` | owner `pricing`, public entry `#pricing/index.ts`, import regex `#pricing/`, scanned = db, shared, providers, scripts + `domainDirs()` |
| `lint-type-homes` | roots = db + domain dirs, non-transport files only (same population as before); allowance paths |
| `lint-no-throw-in-services` | walk domain dirs, non-transport files only; recompute the floor from the real count |
| `lint-domain-errors` | same walk as above; floor recomputed |
| `lint-one-catch` | walk domain dirs, ALL files (it covered transport before) |
| `lint-no-literal-views` | `startsWith("domain/")` becomes "under a domain dir and not a transport file"; allowance paths |
| `lint-input-shapes` | `DOMAIN_ROOT` becomes the domain dirs, non-transport files |
| `lint-no-column-arrays` | db + domain dirs, non-transport files; floor recomputed |
| `lint-row-vs-list` | walks db + domain dirs (all files) |
| `lint-db-calls` | layer roots = db + domain dirs |
| `audit-silent-mutations` | walk db + domain dirs; import prefixes; ACCEPTED key `pricing/sales-tax/service.ts::tax.accrue` |
| `lint-test-locks`, `lint-test-actor` | specifier prefixes `#db/` + every `#<domain>/`; graph roots db + domain dirs |
| `route-guards` | reads `#<domain>/...routes` imports in `app.ts`; walks domain dirs for nested mounts |
| `validate-wire`, `reconcile-payments`, `seed-e2e-*`, `lint-script-guards` message | import paths |

Every self-test (`--self-test`) still passes AND still proves what it proved.
Fixture trees that need `domainDirs()` write a minimal `package.json` into
their temp root.

## Coverage thresholds

`domain/**` (80/67/86/83) and `transport/**` (82/48/75/82) become one key
built from `domainDirs()`. Its numbers are the MEASURED values after the move,
floored to integers: a ratchet at the real number, never a guess. Before and
after go in this file.

## Not in scope

No behaviour change. No URL changes (ruling 13: the route table is identical
before and after; `route-guards` and a `router.<verb>(` inventory diff prove
it). No renames of exports or files. No frontend, contracts, client,
components. No commits.

## Result

Executed 2026-09-06 on `domains-lane`. Nothing committed.

**Files moved: 321**, all with `git mv`, all destinations from the map above
computed mechanically — 320 into the nine domains plus `domain/index.ts` ->
`domains.ts`. `api/domain/` and `api/transport/` no longer exist. Zero
destination collisions: the one folder that existed on both sides
(`orders/tests/`) merged with no name clash, so the `http-` prefix the map
reserves was never needed. 491 import specifiers rewritten by script across
218 files; `grep -rn "#domain\b\|#domain/\|#transport" api` finds nothing.

**Route inventory: IDENTICAL.** Every `app.use("/api...")` in `app.ts` and
every `router.<verb>(`/`router.use(` line, sorted, taken before the move from
`transport/` and after from the nine domains: 173 lines, `diff` empty.
`route-guards` agrees from the other side — **136 routes, 70 requireAdmin,
55 requireUser, 10 unguarded, before and after.**

### Lint populations and floors

Each floor is the MEASURED population, not a guess. Baselines were taken by
running each lint from a `git archive HEAD` copy of the old tree.

| lint | population before -> after | floor before -> after |
|---|---|---|
| `lint-domain-boundaries` | 18 -> 52 (lanes now hold their transport too, and `orders/` holds refiners) | 18 -> 52 |
| `lint-pricing-owner` | 316 -> 302 (rates/spots/metals/sales-tax are inside the owner now) | 300 -> 302 |
| `lint-type-homes` | 139 -> 139 | 100 -> 139 |
| `lint-no-throw-in-services` | 73 -> 73 | 72 -> 73 |
| `lint-domain-errors` | 92 -> 92 | 70 -> 92 |
| `lint-one-catch` | 170 -> 169 | 140 -> 169 |
| `lint-no-column-arrays` | 139 -> 139 | 130 -> 139 |
| `lint-no-literal-views` | 270 -> 269 | 150 -> 269 |
| `lint-db-calls` | 408 -> 407 files, 111 -> 111 calls | 250 -> 407 files (call floor 60 untouched: the call population did not move) |
| `lint-input-shapes` | 92 -> 92 domain files, 15 builders | no file floor (asserts non-zero) |
| `lint-row-vs-list` | 19 -> 19 calls checked | no file floor |
| `lint-test-locks` | graph 139 -> 216 modules, 92 -> 92 calls, 234 test files | test-file floor 100 untouched |
| `lint-test-actor` | graph 139 -> 216 modules, 134 -> 134 calls, 234 test files | test-file floor 100 untouched |
| `audit-silent-mutations` | 14 discarded / 0 unobservable, before and after | report-only |
| `audit-query-paths` | 594 SQL literals, before and after | 100 untouched |
| `route-guards` | 136 routes, before and after | 115 untouched |

The `-1` in one-catch, no-literal-views and db-calls is `domain/index.ts`
becoming `domains.ts` at the api root, which is outside every walk root. It is
a re-export barrel: no throw, no catch, no literal view, no query. The graph
growing from 139 to 216 in test-locks/test-actor is transport entering the
import graph, which is coverage gained, not lost — the calls checked and the
findings are unchanged.

Every `--self-test` still passes and still proves what it proved. Fixture
trees that reach `domainDirs()` now write a minimal `package.json` into their
temp root; fixture paths moved with the layout (`domain/widgets/` ->
`widgets/`, and so on).

### Coverage

`domain/**` (80/67/86/83) and `transport/**` (82/48/75/82) became one key,
`{catalog,checkout,crm,identity,logistics,media,orders,payments,pricing}/**`,
built from `domainDirs()`. Measured after the move over 168 files:
statements 86.3884, branches 73.1205, functions 90.2305, lines 88.6761 —
**set to 86 / 73 / 90 / 88**, floored, never rounded up. The key was proved to
bind by setting statements to 99 and watching vitest name the glob in its
failure. 233 test files, 1327 tests, 1 skipped, green.

### Changed outside the move

- `scripts/lib/layout.ts` is new, with `scripts/lib/tests/layout.test.ts`
  (`lint-script-guards` requires a detector or an excuse for every script; the
  test is the excuse, the same way `test-layers.ts` is excused).
- `vitest.config.ts` derives BOTH its alias list and its coverage keys from
  `package.json` `imports`; its hand-written alias array is gone.
- Six path-dependent tests followed the move: `media/images/tests/unit.test.ts`,
  `orders/tests/rules.test.ts` and `orders/tests/refiner-edits.test.ts` lost one
  `..` because their folders are one level shallower;
  `identity/authorization/tests/role-ladder.test.ts`,
  `shared/db/tests/transaction-side-effects.test.ts` and
  `shared/http/tests/endpoints.test.ts` walked `domain`/`transport` by name and
  now call `domainDirs()`. `endpoints.test.ts` also resolves a URL to a routes
  file against the api root as well as each domain, because a URL whose first
  segment IS a domain (`/api/payments/methods`) used to resolve under
  `transport/`.
- `route-guards`' KNOWN_ROUTES lost
  `DELETE /api/purchase_orders/purge_cancelled`. **This was already failing at
  the branch tip** — the route was deleted with the Great Purge and the control
  was never taken out, which nothing noticed because `audit:routes` is not a
  `pnpm check` member. Removing a control for a route that does not exist
  leaves nothing unguarded, and the script's own message prescribes exactly
  this. `identity/authorization/tests/admin-routes.test.ts` already carried the
  same route in its EXCLUDED set.

### Left behind, deliberately

- **`logistics/fulfillments/owner.ts` gained an ACCEPTED entry in
  `lint-no-throw-in-services`.** It is a transport helper (it takes an express
  `Request` and raises the 404 its controllers surface) but it is not
  `routes.ts` or `controller.ts`, so `isTransportFile` does not claim it and
  the lint now sees it. Its role did not change; the entry says so.
- **`domains.ts` is scanned by no lint.** It sits at the api root, outside
  every walk root, where `domain/index.ts` used to be inside one. It is a
  barrel of `export * as` lines: nothing any of these lints looks for can live
  in it.
- **`lint-pricing-owner` no longer scans `pricing/`'s sub-resources** (rates,
  spots, metals, sales-tax) for money arithmetic, because they are inside the
  owner now. They were clean before, so nothing was hidden — and money
  arithmetic is what the pricing domain is FOR. Its import rule keeps exactly
  the module set it guarded before (`pricing/`'s own top-level non-transport
  files): a plain `#pricing/` match would newly forbid fourteen legitimate
  imports — `app.ts` mounting `#pricing/routes.ts`, the cron reading the spot
  feed — which is a behaviour change, not a move.
- **`identity/authorization/tests/admin-routes.test.ts` still imports
  `../../../scripts/route-guards.ts` relatively.** It did before; the depth is
  unchanged (3 either way) so it still resolves.
