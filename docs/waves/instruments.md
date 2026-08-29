# Instruments lane — closing the hole every rotted script fell through

Scope: every `*.test.{js,ts,tsx}`, every `tests/` directory, `api/types/*.d.ts`,
`api/scripts/**`, `frontend/scripts/**`, `api/tsconfig.json`.
NOT source: `api/features/**`, `api/legacy/**`, `packages/contracts/**`,
`frontend/features/**`, `frontend/shared/**` — a WRITE PIVOT lane owns those
concurrently.

Branch state at start: `af8bc790`, tree clean apart from two files another lane
left modified (`FOLLOWUPS.md`, `frontend/scripts/lint-call-site-styling.mjs`).

```
1. Type coverage for scripts/ (D157)       ██████████████░░░░   75%
2. The 28 remaining .test.js files         ██████████████████  100%
3. ComposedOrder probe (D159, report only) ██████████████████  100%
4. The meta-guard's missing half (D5)      ██████████████████  100%
```

## Where this stands

Four tasks. **Fourteen numbered findings, I-1 to I-14, covering twenty-three
concrete defects** (I-5 bundles six of one kind, I-9, I-11 and I-13 two or three
each). Counted here rather than asserted: the headings below are the census.
**Two of the fourteen are mine, committed mid-lane** — I-13 is I-2's pattern and
I-14 is D160's, made while writing the guard against it. Both are recorded at
the same weight as the rest, because a defect list that only contains other
people's is not a defect list.

The one that matters most is I-1. **This lane's own conversion would have
silently retired the gate's first assertion**, and it was caught only because
the fix happened to go in before the conversion did. Had the order been
reversed, `lint:script-guards` would have gone on printing "54 parse" over
thirteen files it could not read.

Two findings are not this lane's to fix and are handed over with the exact edit:
**I-10** (`WireData` is narrower than the contract `rename()` keeps) and the
whole of **Task 3** (`compose.ts` discards `ComposedOrder` at its own boundary,
which makes D159 a two-file change rather than one).

## Baselines, re-derived this session (D160)

Numbers below were computed here, not carried forward.

| measure | command | value |
|---|---|---|
| `api` typecheck at start | `tsc -p api/tsconfig.json` | **exit 0, 0 errors** |
| `.test.js` under `api/` | `find api -name '*.test.js'` | **28** |
| `.test.ts` under `api/` | `find api -name '*.test.ts'` | **110** |
| scripts in the census | `api/scripts` 46 + `api/scripts/lib` 4 + `frontend/scripts` 4 | **54** |
| suite at start | `pnpm --filter @dorado/api test` | **942 tests, 941 pass, 1 fail** |
| suite at end | same command, after every edit | **941 tests, 941 pass, 0 fail** |

The one failure at start was mine and momentary: a rename landed mid-run. But
942 is not the number it looks like — see I-3. **941 of those were tests and one
was a library the runner had been importing as if it were one.**

## Defects found

Sections below run in the order the work happened — Task 1, then 3, 4, 2 — which
is also the order the findings arrived in. I-1 to I-5 are Task 1's, I-6 is Task
4's, I-7 to I-14 are Task 2's and the two mine.

### I-1. `node --check` IS BLIND TO TYPESCRIPT, AND IT IS GATE MEMBER 9's FIRST ASSERTION

`lint-script-guards.mjs` assertion 1 — "EVERY SCRIPT PARSES", the one written
for D118 (`diff` unparseable for ten commits) — runs `node --check <file>`.
**`node --check` exits 0 on a `.ts` file whatever is in it.** Attacked directly:

```
$ printf 'export const F: Record<string,string> = {\n  a: "b",\n' > broken.ts
$ node --check broken.ts ; echo $?
0
$ printf 'const y: = 2;\n' > broken2.ts ; node --check broken2.ts ; echo $?
0
```

Both are the exact shape of D118 — an object literal whose closing brace was
lost — and both pass. `--experimental-strip-types --check` passes them too.

So the conversion this lane is performing would have SILENTLY DISABLED the parse
check for every script it converted, while the census went on printing
"54 parse". Third instance of D135's law in this file's own history: a report
that cannot see its subject prints a smaller number — here, an unchanged one.

FIXED by parsing `.ts` through `node:module`'s `stripTypeScriptTypes()`, which
throws on both fixtures above. `.mjs` keeps `node --check`. A self-test case
plants a broken `.ts` so the new leg is pinned by attack, not by reading.

### I-2. THE CENSUS WAS EXTENSION-LOCKED TO `.mjs`

`listScripts()` filtered `name.endsWith(".mjs")`. That is D120's hardcoded
`routes.ts` in another costume: the moment a script becomes TypeScript it leaves
the census entirely — no parse check, no self-test execution, no EXCUSED pin.
Only the `SCRIPT_FLOOR` of 50 would have caught it, and only after five
conversions. Now walks `.mjs` and `.ts` (skipping `.d.ts` and `*.test.ts`).

### I-3. THE SUITE HAS BEEN COUNTING A LIBRARY AS A TEST

`node --test` with no arguments discovers `**/*-test.?(c|m)js` (and the
TypeScript equivalents). `api/scripts/lib/self-test.mjs` MATCHES THAT PATTERN.
The attack harness — the file every `--self-test` in the tree runs through — has
been imported and counted as a passing test file on every suite run.

Proved in a three-file probe directory:

```
✔ lib/self-test.mjs   ✔ lib/self-test.ts   ℹ tests 2
```

`lib/suite-invocation.mjs` in the same directory is not matched, so it is the
NAME, not the location. Consequence: the suite's own total has been one higher
than the number of test files, and every count taken from it inherited that —
including tonight's stated baseline. **942 is 941 tests plus one library.**
Exactly D160's shape, arrived at from the other end: not a number carried
forward, but a number that was never counting what its name said.

FIXED by renaming to `self-test-harness.ts`, which the glob does not match
(re-probed: `ℹ tests 0`). Its ~10 importers and its EXCUSED entry moved with it.

### I-4. `.mts`, NOT `.ts`, IN `frontend/` — AND THE CHECK THAT ALMOST MISSED IT

`frontend/package.json` has no `"type": "module"`. `.mjs` said ESM explicitly;
`.ts` does not, so `audit-state-collapse.ts` ran with
`MODULE_TYPELESS_PACKAGE_JSON` and a reparse. Adding `"type": "module"` to a
Next.js package is not a change to make in passing, so the frontend's scripts
take `.mts` and `frontend/tsconfig.json` gains `"**/*.mts"` to its include.

The sharp part: **`".mts".endsWith(".ts")` is `false`.** The parse check I had
just written for I-1 would have routed every frontend script straight back to
the blind `node --check`. Caught because the conversion happened after the fix
rather than before it. Pinned by its own self-test case.

### What is converted, and what deliberately is not

`api/tsconfig.json` no longer excludes `scripts`, and **13 scripts are now
TypeScript and typechecked** — the 4 in `scripts/lib/` first (they have real
consumers), then the 7 that rotted, then two more gate members:

```
scripts/lib/baseline.ts  feature-map.ts  self-test-harness.ts  suite-invocation.ts
scripts/lint-migrations.ts  diff-source.ts  audit-test-leaks.ts  route-guards.ts
scripts/validate-wire.ts  audit-frontend-nullability.ts
scripts/lint-db-calls.ts  lint-row-vs-list.ts
frontend/scripts/audit-state-collapse.mts
```

**41 scripts remain `.mjs` and are honestly untyped** — `allowJs` with
`checkJs: false` means `tsc` parses and ignores them, which is the state before
this lane for every script and is not worse than it was. A half-typed script is
worse than an honest untyped one, so they are listed rather than rushed:
`audit-{constraints,coverage,enum-domains,guards,indexes,item-price,non-finite,`
`nullability,payments,precision,query-paths,slow-tests,switches,table-owners,`
`vacuous-tests,wire-readiness}`, `backup`, `clean-dual-run-orphans`,
`compare-{databases,tables}`, `dump-{schema,seed,stripe-reconciliation}`,
`generate-feature`, `lint-{imports,legacy-boundary,namespace-calls,script-guards}`,
`migrate`, `plan-migration`, `refresh-from-backup`, `seed-e2e-users`,
`verify-{backfill,genesis,genesis-production,orders-decomposition,parity,`
`sales-order-decomposition}`, and `frontend/scripts/lint-{call-site-styling,`
`carrier-vocabulary,list-fanout}`.

The exclusion is what mattered: with `"scripts"` gone from `exclude`, converting
any of these is now a one-line rename that buys real checking, where before it
bought nothing (D157's trap).

### I-5. SIX TYPE-LEVEL DEFECTS IN THE ROTTED SCRIPTS, NONE OF THEM COSMETIC

Found by letting `tsc` look at these files for the first time.

| where | what | live? |
|---|---|---|
| `lint-migrations.ts` `DESTRUCTIVE` | the seven DROP/TRUNCATE/DELETE patterns are an array literal, so `[pattern, label]` destructured to `string \| RegExp` on both halves and `pattern.test(...)` does not typecheck. On the guard for **do not lose data**. | no — JS does not care. But nothing could ever have told you the list was malformed. |
| `validate-wire.ts:224` | `out.filter(Boolean).map(toWire)` — `filter(Boolean)` reads as a narrowing and is not one. `toWire` destructures a value the type says may be `null`. | no (runtime filter works); the type was lying about the guarantee. |
| `validate-wire.ts:372` | same shape on `links.filter(Boolean).map(l => …l.address_id)`. | no |
| `diff-source.ts:336` | `Array.isArray(a) ? \`${a.length} vs ${b?.length}\`` — `b` never checked. When one side returns an array and the other a row, the size label printed `3 vs undefined` instead of saying the shapes differ. | **yes, in the output of the switch-promotion gate.** |
| `audit-state-collapse.mts:394` | `--self-test` read `probe.rest.bg.rgb` with no guard. If `theme.css` dropped `background`/`card`, or the bracketed-variant parser lost that spelling, the self-test died on a `TypeError` naming nothing rather than reporting what it could not resolve. | latent |
| `feature-map` `BLOCKED = {}` | inferred `{}` — no index signature, so every `BLOCKED[column]` in a consumer was an error waiting for the day `tsc` was allowed to look. | no |

Two `unknown`-boundary narrowings were added rather than casts: `diff` and
`validate:wire` now check that `getPaymentIntentFromSalesOrderId` **is a
function on the module they loaded** before calling it, and throw naming D110 if
it is not. That is the precise failure D110 was — a gate calling a function a
factoring pass had moved, with the specifier still resolving.

## Task 3 — the `ComposedOrder` probe (D159). REPORT ONLY; the fix is not mine.

Probed by declaring the six test-side order shapes in one temporary file and
asserting `ComposedOrder`/`ComposedSalesOrder` assignable to each, then deleting
it. **Three mismatches, and the narrowing is a two-file change, not one.**

### The change is bigger than D159 says

D159 says "narrow the four signatures in `read.service.ts`". That is not
sufficient: **`compose.ts` discards the type at its own boundary too.**

```
export function composePurchaseOrder(p: OrderParts): Record<string, unknown>
export function composeSalesOrder(p: SalesOrderParts): Record<string, unknown>
```

Both return `Record<string, unknown>` while declaring `ComposedOrder` /
`ComposedSalesOrder` thirty lines below. So the value is already anonymous
before `read.service.ts` ever sees it, and narrowing the service alone would
require a cast at the composer's edge — which is the defect moved, not removed.
**Narrow the two composers first, then the four service signatures.**

### The three mismatches, with which side is wrong

**1. `ScrapPart.content: number` is wrong, and the code around it already knows.**
`features/media/pdfs/render/sections.ts` declares scrap `content` as a required
non-nullable `number`. `ComposedScrap.content` is `number | null`, and
**`orders.items.content` is nullable in the schema** (0 nulls in dev today).
The template that consumes it guards for null on two lines —
`scrap.content != null ? scrap.content.toFixed(3) : "&mdash;"` — and
`getItemPrice(content: number | null | undefined, …)` accepts null on a third.
`content` is the ONLY required field in a nine-field interface where everything
else is optional.

What makes it worth naming rather than shrugging at: line 529 is
`const scrap: ScrapPart = item.scrap ?? ({} as ScrapPart);` — **an empty object
cast to a type that requires `content`.** The constraint is declared, then
disabled by a cast one line from where it would have fired. D103's rule
("a hand-written type is a duplicate or an unenforced constraint") with the
disabling edit visible in the same function.
Not live: every runtime read guards. Fix: `content?: number | null`, which then
lets the `?? {}` fallback drop its cast.
**Owner: the lane that owns `features/media/**`.**

**2. `created_at` — the test and the composer disagree, and `new Date(null)` is 0.**
`features/orders/tests/sales-read.test.ts` declares `created_at: string`;
`ComposedSalesOrder` says `Date | null`; `orders.orders.created_at` is
**nullable** in the schema. The test does
`new Date(o.created_at).getTime()` to assert ordering — and `new Date(null)`
is `0`, not `Invalid Date`, so a null would sort to 1970 rather than throwing.
The test's declaration is wrong on both counts (`Date`, not `string`;
nullable, not required). **Mine to fix, in Task 2's pass over that file.**

**3. `address.address_id` — the test is narrower than the composer.**
`purchase-read.test.ts` declares `address: { address_id: string } | null`;
`ComposedAddress.address_id` is `string | null`, because `snapshotAddress` does
`(a.id as string | null) ?? null`. The test only ever inspects orders it has
already filtered to `o.address_id` truthy, so the narrowing is sound *for that
test* — it is the least interesting of the three. **Mine.**

### Handoff to the write-pivot lane, as one edit

```
compose.ts:364   composePurchaseOrder(p: OrderParts): ComposedOrder
compose.ts:529   composeSalesOrder(p: SalesOrderParts): ComposedSalesOrder
read.service.ts  assemblePurchases / assembleSales -> ComposedOrder[] / ComposedSalesOrder[]
read.service.ts  getAllPurchases, findPurchasesByUser, findPurchaseById,
                 getAllSales, findSalesByUser, findSaleById  (SIX exported, not four)
```

Expect the composers themselves to surface further mismatches — the probe could
only compare the *declared* types, not the object literals the composers build.

## Task 4 — the meta-guard's missing half (D5)

`lint:script-guards` asserted "a script has neither a self-test nor an EXCUSED
entry". D5's rule was **"neither a self-test nor a FLOOR"**, and the floor half
had never been enforced — so an excuse could *say* "carries a floor" and nothing
read the file to check.

### I-6. `audit:coverage` WAS EXCUSED FOR A FLOOR IT DOES NOT HAVE

Its entry read: *"every populated exchange column with nowhere to go. The
subject is the database catalogue; **a floor guards the walk**."*

There is no floor in `audit-coverage.mjs`. The word appears once, in its header,
meaning something else entirely: *"It cannot know whether a mapping is CORRECT,
only whether one exists. It is a floor, not a ceiling."* Two senses of one word,
one of them load-bearing in an excuse nothing verified — D165's shape exactly.

This is the audit CLAUDE.md says to run **before splitting any repo**, written
because orders had matching row counts and twenty-one missing columns. Without a
floor, `every populated column has somewhere to go` is what it prints when it
walked nothing.

FIXED: it now counts what it walked and refuses below a floor. Re-derived on the
run that added it: **415 columns across 34 source tables** in dev, floor 250.

### The other four reports had no floor either

`compare-databases` had a `compared === 0` zero-check, which D135 explicitly
calls out as weaker than a floor — and its own failure mode is *partial*: a role
with USAGE on two schemas of twenty compares four tables, finds them identical,
prints success. `audit-constraints` had a real floor spelled `checked < 50`,
which is a floor in every sense except one a checker can see.

| script | floor added | measured now | fires under attack |
|---|---|---|---|
| `audit-coverage` | `COLUMN_FLOOR` 250 | 415 columns / 34 tables | yes |
| `audit-indexes` | `INDEX_FLOOR` 40 | 50 indexes / 18 features | yes |
| `audit-precision` | `PRECISION_FLOOR` 45 | **59** type differences | yes |
| `audit-enum-domains` | `COUPLING_FLOOR` 4 | 4 couplings | yes |
| `verify-parity` | `PAIR_FLOOR` 12 | **15** pairs compared | yes |
| `compare-databases` | `TABLE_FLOOR` **70** (see I-14) | 76 compared, 9 unreadable | yes |
| `audit-constraints` | `checked < 50` → `CONSTRAINT_FLOOR` | 50 | — |
| `validate-wire` | already had two | 27 shapes | — |

**Two numbers moved, both re-derived rather than carried (D160):**
`audit:precision` examines **59** type differences, not CLAUDE.md's 57.
`verify:parity` compares **15** pairs, not FOLLOWUPS D130's 11 — the four
checkout pairs wave 5C added. Neither is a contradiction; both older numbers
were correct when written. Different denominators, again.

`verify-parity` also needed a real change to make its floor mean anything: a
pair whose table is absent printed `MISSING TABLE` and returned `false`, so a
run where **every** table had vanished would have satisfied a floor on pair
count while comparing nothing. It returns `null` now, and only real comparisons
count towards the floor.

### The mechanism

Every EXCUSED entry now declares a `kind`: `action` (does something),
`assertion` (fails on its own subject), `library` (covered by its importers and
its own tests), `report` (**counts something — must carry a floor**). Census
today: **32 excused = 12 action, 8 assertion, 4 library, 8 report.**
A floor is recognised by being NAMED — a constant matching `*FLOOR*`. That is a
convention rather than a shape analysis, and its blind spot is written into the
file: it cannot tell a floor that fires from a constant declared and never
compared, which is why each of the five new floors was separately proved by
running its script with its own `*_FLOOR` override set to 999.

### Verified by attack, on the real tree, not by reading output (D134)

| attack | result |
|---|---|
| Delete the floor block from `audit-enum-domains.mjs` | `NO-FLOOR`, exit 1, named. Restored → 0 |
| A new `audit-newthing.mjs` that counts and guards nothing | `NO-GUARD`, exit 1 |
| Re-label `audit-indexes` as `kind: "action"` | `MISCLASSIFIED`, exit 1 |
| A broken `.ts` and a broken `.mts` in the census | `PARSE`, exit 1 (see I-1) |
| Its own `--self-test` | **15 cases**, up from 9 |

One case is worth naming on its own: **"a comment saying FLOOR does not count as
having one."** This file's own history is that the environmental rule was
satisfied by prose *about* the library it was checking for. A guard satisfied by
a comment about itself is not a guard, and the same mistake was available here.


## Task 2 — the last 28 `.test.js` files

**Zero `*.test.js` remain under `api/`.** All 28 moved into a `tests/` directory
beside their subject (ruling 31) and converted to TypeScript (ruling 33) in ONE
pass. Six needed their path bases re-based by a level; two took four bases
between them, as expected.

| moved to | files |
|---|---|
| `api/tests/` | `db` |
| `features/auth/tests/`, `features/authorization/tests/` | 2 |
| `providers/{captcha,emails,shipments,shipments/utils}/tests/` | 5 |
| `scripts/lib/tests/` | 2 |
| `shared/{cron,db,env,http,middleware,testing,utils,wire}/tests/`, `shared/tests/` | 19 |

Typecheck went **0 → 157 errors → 0**. No `any` was added anywhere. Three casts
exist in the whole conversion, all at a framework-object boundary (express's
`Request`/`Response`, `app._router`), each commented with what is being claimed
and why a structural subset is not available — a `Request` has hundreds of
members and cannot be declared field by field the way a fixture can.

### Defects the conversion surfaced

**I-7. A FedEx fixture named a field the payload builder does not read.**
`providers/shipments/tests/endpoints.test.ts` built its input as
`{ shipper, recipient, pkg: {...} }`. `createShipmentPayload` destructures
`packageDetails`, and does `requestedPackageLineItems: [packageDetails]` — so
**every payload that test built carried `requestedPackageLineItems: [undefined]`**,
and it passed, because the only thing it greps the resulting JSON for is an
account number. The assertion was never wrong; the thing it was asserting about
was. Fixed to `packageDetails`.

**I-8. A test asserting a config key is absent, where the type says so too.**
`features/auth/tests/config-options.test.ts` asserted
`changeEmail.sendChangeEmailVerification === undefined`. TypeScript answered
*"Property 'sendChangeEmailVerification' does not exist … Did you mean
'sendChangeEmailConfirmation'?"* — better-auth's own types agreeing with the
test. Rewritten as `!("sendChangeEmailVerification" in changeEmail)`, which is
a stronger runtime claim (the key is absent, not merely undefined) **and** keeps
the compiler's version of the answer.

**I-9. Two more tuple-literal widenings, same shape as `lint-migrations`.**
`shared/tests/mirror.test.ts`'s `ALLOWED_DIFFERENCES` and
`shared/http/tests/browser-triggered-effects.test.ts`'s `keys` both widened to
`(A | B)[][]`, so `out.replace(re, to)` matched no overload and `at < m.index`
compared `string | number` against a number. Three instances of one pattern in
this session; it is invisible until something typechecks the file.

**I-10. `WireData` is narrower than the contract `rename()` keeps. SOURCE, not
mine.** `shared/wire/tests/adapter.test.ts` has a test named *"nothing, and
things that are not rows, pass through"* which feeds `toWire` a boolean, a
string and a number. `WireData` is `WireRow | WireRow[] | null | undefined` —
all three are outside the declared domain — while `rename()` guards
`typeof row !== "object"` precisely so they survive. The implementation and the
test agree; the declaration disagrees with both.
**Fix: widen `WireData` in `api/shared/wire/rename.ts` to admit scalars.**
Marked at the call site rather than silently cast away.

**I-11. Two tests would have died on `undefined` naming nothing.**
`shared/middleware/tests/errorHandler.test.ts` read `body.error.message` in
eleven places without ever checking that the handler called `res.json`;
`scripts/lib/tests/baseline.test.ts` did `onDisk.at(-1).slice(0, 3)` on a
directory listing. Both now refuse with a sentence naming what did not happen.
Neither is a live failure — both are the difference between a test that reports
and a test that crashes.

**I-12. `process.env.FEDEX_SANDBOX_ACCOUNT_NUMBER` fed straight to `includes()`.**
Unset, `includes(undefined)` compares against the literal string `"undefined"`
and the failure reads *"a sandbox label was built against the live account"* —
a confident lie about what went wrong. Now asserted present first.

### Two conventions established, both by attack

`request(app)[verb.toLowerCase()](url)` appears in two of these files and
SuperTest declares no index signature. Replaced with a `switch` over the five
verbs that **throws by name** on anything else — so a route carrying a verb the
test cannot drive fails at that route rather than becoming `undefined(...)`
inside a loop over 68 admin routes.

`adminRoutes.filter((r) => r.url && …)` does not narrow `url`, so
`send(r.verb, null)` was a request to the string `"null"` waiting for the first
admin route with an unresolved mount. Now a type predicate.

### I-13. MY OWN GREP COULD NOT SEE HALF THE PATH BASES IT WAS LOOKING FOR

Moving 28 files into `tests/` re-bases every path computed from
`import.meta.dirname`. I grepped for them and got **six of nine**. Two
independent mistakes, and it is worth separating them because only one is the
one I would have predicted:

1. **THE FILE LIST.** I ran the grep over eight files I had picked by reading
   the move list, not over all 28. `shared/wire/tests/adapter.test.ts` was not
   among them and its path base contains a perfectly greppable `../../features`.
   **Choosing which files to scan is itself a pattern, and mine was wrong before
   the regex ever ran.**
2. **THE SPELLING.** Of the remaining two, both write the base as

   ```
   path.resolve(import.meta.dirname, "../../..")            <- my regex matched
   path.join(import.meta.dirname, "..", "..", "features")   <- IT DID NOT
   ```

   The quoted-segment form contains no `../` at all.

Result: `shared/db/tests/source-switches`, `shared/db/tests/switch-surface` and
`shared/wire/tests/adapter` all resolved to `api/shared/features`, which does not
exist. **3 test failures in the run after Task 2 (937 tests, 934 pass, 3 fail).**
All three fixed and re-run green.

This is D95/D99/D108/I-2 again, committed by the lane whose whole subject is
that pattern: **a detector that recognises one spelling reports clean on the
others** — and the more interesting half is that a hand-picked file list is a
detector too. The correct grep is the unfiltered one over every moved file,
which is what found them afterwards.

Two things are worth noting about how they failed. They **threw**, loudly, on
`readdirSync` of a missing directory — the assertion behaviour of D135, not the
report behaviour. And both switch tests carry a floor (`switches.length >= 2`),
so had the walk returned `[]` instead of throwing, the floor would have caught
it anyway. Belt and braces, and both were needed.


### I-14. I SET A FLOOR FROM A SENTENCE INSTEAD OF FROM A RUN

The floor I added to `compare-databases.mjs` read:

```js
// Both databases hold well over a hundred tables; the floor is on what was
// really compared […]
const TABLE_FLOOR = Number(process.env.COMPARE_DB_FLOOR ?? 100);
```

**A real run compares seventy-six.** Prod against test: 76 comparable tables,
9 more unreadable under the read-only role. So the floor I had just written to
catch a vacuous comparison would have fired on every honest one — turning a
guard into noise, which is the thing that makes people delete guards.

D160 committed inside the guard against D160, in the same hour as writing up
D160. The number came from CLAUDE.md's prose about the schema rather than from
`node scripts/compare-databases.mjs`, and I did not run it until the *attack*
test made me. Corrected to 70, derived from the run, with the measurement and
its date in the comment.

**The attack is what found it.** Setting `COMPARE_DB_FLOOR=999999` to prove the
floor fires printed `compared 76 table(s)` — and that number, which I only
looked at because I was checking something else, is what showed the default was
wrong. D134 says plant a violation to find out whether a guard can see. It also
tells you what the guard is looking at, and that is worth reading.

## Verification

Every number below was produced by a run in this session, after the last edit.

| gate member | result |
|---|---|
| `pnpm --filter @dorado/api test` | **941 tests, 941 pass, 0 fail**, 443 s, exit 0 |
| `pnpm --filter @dorado/api typecheck` | **0 errors** — with `scripts/` no longer excluded |
| `lint:imports` | 1332 internal imports checked, 0 unresolved |
| `lint:db` | 202 `query()` calls in 337 files |
| `lint:namespace-calls` | 1259 checked, 0 unresolved |
| `lint:row-vs-list` | 1 checked, 0 read as a row |
| `lint:migrations` | 104 files, no destructive writes to `exchange` |
| `lint:script-guards` | 54 scripts, 54 parse, 20 self-tests run, 8 reports all carrying floors |
| `validate:wire` | 27 endpoint shapes match, 0 diverge |
| `audit:switches` | no import reaches around a switch |
| `audit:coverage` | 1 column with no home *(unchanged)*; 415 columns / 34 tables walked |
| `audit:indexes` | every access path still indexed or accepted; 50 checked |
| `audit:query-paths` | every query has an index to enter by |
| `audit:non-finite` | every numeric column finite |
| `audit:precision` | 0 columns would change, **59** differences examined |
| `audit:enum-domains` | 4 couplings, all labels |
| `contracts` build + `verify:fresh` + `validate` | 36/36 tables validate cleanly |
| `frontend typecheck` | 0 errors — with `**/*.mts` now included |
| `frontend test` (vitest) | 23 files, 163 tests, all pass |
| `frontend build` | ✓ compiled, 25/25 static pages, exit 0 |
| `lint:carrier-vocabulary` | 377 files, 0 in product code |
| every converted script's `--self-test` | all green, re-run after conversion |

**On the suite count: 942 → 941, and nothing was lost.** The one that left is
`scripts/lib/self-test.mjs`, which was never a test (I-3). 138 `.test.ts` files,
0 `.test.js`.

Not run, and why: `verify:genesis` and `verify:backfill` (nothing this lane
touched is a migration or a backfill), `audit:test-leaks` (writes, and is
deferred from the gate by name), `compare:databases` (run twice for I-14 — it
reports 54 differences between prod and test, which is the state of `test`, not
a regression).
