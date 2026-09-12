# The frontend nuke (ruling 99)

Jacob: *"fuck it, yeah go for it. might as well remove associated tanstack
while ur at it."*

Every customer- and admin-facing surface is deleted. What is left is the
passwordless auth flow, a placeholder homepage built from three Figma
components, and the scaffolding both need. **323 files deleted, 16 modified.**
Nothing is lost — git has all of it, and the API did not change.

## Why this is not the usual "delete the dead code" pass

The frontend was pinned to an API that has since been rewritten three times
over (lots, payment rails, REST routes, passwordless auth). `docs/waves/
frontend-sync-2026-09-08.md` got 26 routes rendering again; the rest carried
54 typecheck errors, hooks named for endpoints that no longer exist, and money
behaviour nobody had re-verified against the new tables. Ruling 99 is that the
cheaper path is to rebuild each surface against the API as it is, one at a
time, rather than to keep repairing surfaces against an API that keeps moving.

**The rule that shaped every decision below**: a guard whose subject is deleted
does not become a passing guard, it becomes a scan over nothing — and this repo
has five separate floors written because that failure has happened five times.
So every floor that the delete pushed below its threshold was moved to the
honest number for what is actually there, with a comment saying it rises again.
None was removed.

## Kept, and why

| kept | why |
|---|---|
| `app/layout.tsx`, `head.tsx`, `error.tsx`, `loading.tsx`, `not-found.tsx`, `global-error.tsx`, `favicon.ico`, `styles/` | the app skeleton; every route boundary Next needs |
| `app/robots.ts` | rewritten: allow `/`, disallow the whole auth surface. The `sitemap:` line is gone with `sitemap.ts` |
| `app/page.tsx` | rewritten as the placeholder (below) |
| `app/auth/**` (7 routes), `app/settings/**` (4 routes) | the passwordless screens — `docs/waves/frontend-auth.md` is their spec |
| `shared/ui/auth/AuthShell.tsx`, `AuthForm.tsx` | the Panel/Pitch shell and the twelve-state form |
| `shared/utils/authForm.ts`, `formatPhoneNumber.ts` | the whole view→state mapping, and the one formatter the screens use |
| `shared/hooks/auth/{authClient,queries}.ts`, `useAsyncAction.ts`, `useCaptcha.tsx`, `useProtectedPage.tsx` | better-auth's client, the session/impersonation housekeeping, the captcha the OTP send needs, the role gate on `/settings/*` |
| `shared/providers/*` (all five) | theme, query client, maps, `LayoutProvider`, `VerificationProvider` |
| `shared/types/routes.ts` | trimmed to the eleven auth paths and two fields — `roles` and `seoIndex` |
| `playwright.config.ts`, `shared/tests/auth.setup.ts`, the seeded users | the e2e harness, and the one spec that proves OTP sign-in end to end |
| `@dorado/components` | untouched. Jacob's design system |

**`LayoutProvider` survives as a seam, not as logic.** It used to branch per
route between the site chrome and the full-bleed auth panels; every surface
that wore the chrome is gone and the auth panels were always the bare branch,
so it is now `VerificationProvider` wrapping `{children}`. It stays because it
is the one client component mounted around every page, and it is where the nav,
the footer and the drawer host come back.

**`shared/utils/cn.ts` went with the chrome.** After `LayoutProvider` was
trimmed nothing imported it. `@dorado/components` has its own copy at
`packages/components/src/cn.ts`, which is the one that matters.

## `app/page.tsx`

Three components out of `@dorado/components` — `Header`, `Hero`, `Footer` —
plus the brand mark and a sign-in link. No copy invented: the title and the one
line under it are `Hero`'s own.

**One known consequence.** `Hero` draws its own CTAs, "Get a Quote" → `/sell`
and "Browse bullion" → `/buy`, and both routes are deleted, so both 404. Fixing
that means editing the design system and `packages/components` is not this
lane's to change. It resolves itself when those surfaces are rebuilt.

## Deleted, by folder

| folder | files |
|---|---|
| `frontend/app/admin` | 73 |
| `frontend/app/account` | 37 |
| `frontend/app/(checkout)` | 30 |
| `frontend/shared/ui` | 26 |
| `frontend/shared/tests` | 22 |
| `frontend/shared/types` | 15 |
| `frontend/shared/hooks` | 14 |
| `frontend/shared/utils` | 10 |
| `frontend/app/sell` | 10 |
| `frontend/app/buy` | 9 |
| `frontend/app/images` | 7 |
| `frontend/app/sales-tax` | 5 |
| `frontend/shared/store` | 4 (the whole zustand layer) |
| `frontend/app/rates` | 4 |
| `frontend/app/payout-options` | 4 |
| `frontend/app/privacy-policy`, `terms-and-conditions`, `order-placed` | 3 each |
| `frontend/app/sitemap.ts` | 1 |
| `frontend/scripts` | 3 |
| `packages/client/src` | 41 |
| `api/scripts` | 1 |

`frontend/app` + `frontend/shared` went from ~290 files to **70**.

## The `@dorado/client` modules retired

The package **stays**, with TanStack Query under it: it is the mutation and
invalidation layer, and the admin screens will want it on day one. What went is
every resource module, because each one existed for a surface that is deleted:

`addresses`, `checkout`, `fulfillments`, `leads`, `media`, `orders`,
`payments` (queries **and** rails), `pdfs`, `products`, `quotes`, `rates`,
`refiners`, `reviews`, `shipping`, `spots`, `users` — and `src/tests`, whose
four files tested them.

What is left is the substrate plus auth: `fetch.ts` (the fetcher and
`ApiError`), `keys.ts` (trimmed from fifteen namespaces to `auth`),
`session.ts` (the `ensureSession` bridge better-auth registers into),
`cache.ts` (`useQueryCache`) and `auth/queries.ts` — nine `/account/*` hooks.

`package.json` lost its eight subpath exports (`./orders`, `./checkout`, …);
only `.` remains. `test` gained `--passWithNoTests`, which is honest rather
than green-washing: there is genuinely nothing left to test in the package, and
the four deleted suites tested deleted modules.

**They regrow one per surface.** That is the point of doing it this way — a
hook with no caller is a hook nobody has checked against the route it names.

## The e2e specs left

Two files, eight tests, and they pass:

- `shared/tests/auth.setup.ts` — 2 tests. Signs both seeded accounts in
  through the real OTP flow (`send-otp` → read the code back from the recording
  SMS fake via `GET /api/account/last_code` → `POST /api/account/verify_code`)
  and saves the sessions. Kept even though nothing depends on it any more,
  because it is the only end-to-end proof that sign-in works.
- `app/auth/_src_/tests/auth-screens.e2e.ts` — 6 tests. The signed-out screens
  in a real browser.

`playwright.config.ts` lost its `customer` and `admin` projects: both matched
`**/authed/**` and every spec in that directory is deleted. They come back
unchanged with the first authed spec, and the sessions they need are still
written to `playwright/.auth/*.json`. `e2e:maps` went with the Google Places
spec; `e2e` is plain `playwright test` now, since there is no `@maps` tag left
to invert.

Deleted e2e specs, all in git: `anonymous-basket`, `public-pages`,
`degradation`, `authed/admin-creates`, `authed/customer-address-maps`,
`authed/customer-checkout-purchase`, `authed/customer-checkout-sales`.

## Guards moved, and one deleted

| guard | was | is | why |
|---|---|---|---|
| `api lint:client-boundary` frontend floor | 100 | 55 | 75 frontend files left, from ~370 |
| `frontend-routes.test.ts` call floor | 45 | 9 | nine literal `/account/*` calls left |
| `browser-triggered-effects.test.ts` control | `queryFn GET /spots` | `queryFn GET /account/session` | `packages/client/src/spots` is deleted; a control naming a deleted file is a scan over nothing |
| `browser-triggered-effects.test.ts` floor | 95 | 9 | same |
| `browser-triggered-effects.test.ts` ALLOWED | `(top level) GET /products` | `[]` | the top-level products fetch went with `products/fetch.ts` |
| `mirror.test.ts` PAIRS | `convertTroyOz` × 2 | `[]`, plus a new guard | the frontend's copy is deleted, so there is nothing to drift |

**`mirror.test.ts` did not lose its teeth.** An empty PAIRS list passes every
assertion trivially, so the emptiness is asserted from the other side: a new
test fails if `frontend/shared/utils/convertWeights.ts` or
`frontend/features/rates/utils/resolveRate.ts` comes back without a PAIRS
entry. The file exists for the day the second copy returns.

**Three frontend lint scripts were deleted with their subjects**:
`lint-carrier-vocabulary.mjs` (guarded `shared/types/handoff.ts` and
`service.ts`, both deleted, and a hard-coded FedEx uuid in three checkout
components, all deleted), `lint-list-fanout.mjs` (D111 — per-row data hooks;
there are no lists), `audit-state-collapse.mts` (D99 — selected/unselected
tokens resolving to the same colour; there is no state-bearing UI outside
`@dorado/components`, which has its own checks). `lint-call-site-styling.mjs`
STAYS and passes — its subject is `@dorado/components` call sites, which
survive.

**`api/scripts/audit-frontend-nullability.ts` is deleted, and this is the one
worth arguing with.** It compared every field a frontend zod schema requires
against what the column allows, and CLAUDE.md describes it at length. Its
subject is gone completely: **there is not one `z.object` left in
`frontend/`**, and both its self-test CONTROLS — `addressSchema.line_1` and
`achSchema.routing_number` — named schemas in deleted forms. The script's own
error message says *"never just remove the entry"*, and that is honoured here
by deleting the whole script rather than blanking its controls and keeping a
detector that can no longer fire. **It comes back with the first frontend zod
schema**, and it should: the hazard it found (a form schema stricter than its
column, `.parse()`d on a live path) returns with the first form.

## Verification

| check | result |
|---|---|
| `@dorado/frontend typecheck` | **0 errors** (was 54) |
| `@dorado/frontend test` | 4 files, **58 tests**, all auth |
| `@dorado/frontend build` | green — **14 routes** |
| `@dorado/client typecheck` / `test` | green / no tests, exit 0 |
| `@dorado/api lint:client-boundary` (+ `--self-test`) | green, 75 frontend + 7 client files |
| `frontend-routes.test.ts` | green |
| `pnpm --filter @dorado/frontend e2e` | **8/8**, against a local API from this worktree |
| `pnpm check:fast` | green **except `figma:inventory`**, which fails identically at the tip of dev and is untouched by this lane |

**One incidental fix.** `app/layout.tsx` exported its two font objects
(`export const geist`), which Next 16 rejects as a non-route export from a
layout — `next build` failed on it before this lane touched anything. Nothing
imported them; the `export` keyword is dropped.

**`pnpm --filter @dorado/frontend lint` is broken and was before this lane**:
`typescript-eslint` 8.69 refuses TS 7.0. It is not in `pnpm check`.

## What this hands the next lane

An app that builds, typechecks clean, and does exactly one thing. Each surface
gets rebuilt against the API as it is now: write the `@dorado/client` resource
module, add its `keys` namespace, build the screen out of `@dorado/components`,
add its specs, and raise whichever floor the new files push up.
