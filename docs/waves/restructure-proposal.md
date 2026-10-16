# Restructure proposal: tests, scripts, env, docs

Status: proposal, 2026-10-16. Nothing has moved. No ruling changes until Jacob
rules. Env key names only; no value was read.

## 1. Tests: decision

Tests stay colocated with their subject, e2e specs included (rulings 31 and
130 stand). Jacob considered a root `testing/<domain>/...` tree and dropped
it. The reasons: Node subpath imports (`#orders/*`) resolve only inside `api/`,
`lint:test-locks` and `lint:test-actor` walk the api root, the unit/db/http
split reads imports and not folders, and 158 test files hold 310 relative
specifiers. No further work. One stale fact to fix in `CLAUDE.md`: it says 19
Playwright specs; the tree has 9 `*.e2e.ts` files plus 3 setup/teardown files.

## 2. Scripts

### Today

| folder | files | package / run by | why it sits there |
|---|---|---|---|
| `scripts/check.mjs` | 1 | root `pnpm check`, `check:fast` | runs every workspace through `pnpm --filter`; owns no package |
| `scripts/figma/` | 7 + `snapshot.json` + README | root `figma:*`; `design` gate group | reads `packages/theme`, `packages/components/src`; no package deps |
| `api/scripts/lint-*` | 23 | `@dorado/api` `lint:*` | read `api/package.json` `imports` through `lib/layout.ts`; resolve `API_ROOT` from their own folder |
| `api/scripts/audit-*` | 13 | `@dorado/api` `audit:*` | `pg`, `#env`, `#db/*` |
| `api/scripts/verify-*`, `validate-wire`, `compare-databases`, `dump-*` | 8 | `@dorado/api` | `pg`, `#env`, migrations folder |
| `api/scripts/migrate`, `reset-january`, `backup`, `refresh-*`, `provision-test-db`, `preflight-test-db` | 7 | `@dorado/api`; `test` runs preflight first | database actions; `#env` composes the URLs |
| `api/scripts/seed-e2e-*`, `reconcile-payments`, `encrypt-payout-details`, `route-guards` | 5 | `@dorado/api`; root `pnpm seed` | call domain code through `#` imports |
| `api/scripts/lib/` | 8 + `tests/` (6) | imported by lints and by `api/vitest.config.ts` | `layout.ts`, `test-layers.ts` drive the suite and coverage keys |
| `frontend/scripts/` | 1 | `@dorado/frontend` `lint:call-site-styling` | scans frontend source |
| `packages/contracts/scripts/` | 4 | `@dorado/contracts` `generate`, `validate`, `verify:fresh` | generate the package's own source; load `api/.env` by path |

Facts that set the cost of a move:

- 28 of 61 api scripts import `#` subpaths. A package `imports` target must
  start with `./`, so a root `scripts/` cannot map `#db/*` to `api/src`.
- 18 api scripts import `pg`, a dependency of `@dorado/api` and not of the root.
- `api/package.json` holds about 110 script entries by path; `check.yml` and
  the gate call them by name.
- Every lint finds its target as `path.resolve(import.meta.dirname, '..')`.
  Each self-test builds a tree relative to that root.
- `lint:script-guards` scans only `api/scripts`, `api/scripts/lib` and
  `frontend/scripts`. `scripts/`, `scripts/figma/` and
  `packages/contracts/scripts/` have no guard today. That is a gap.

### Cost of one root `scripts/`

Make root a package with every api dependency, rewrite 28 files off `#`
imports (or relative paths that cross package roots, which the layout forbids),
re-root 23 lints and their self-tests, rewrite ~110 script entries and the
gate. It removes a folder name and adds coupling. Not worth it.

### Recommendation

1. Keep scripts in the package they serve. The package is the pnpm filter, the
   dependency set and the subpath map.
2. Split `api/scripts/` by verb: `lint/`, `audit/`, `verify/`, `db/`
   (migrate, reset, backup, refresh, provision, preflight), `ops/` (seed,
   reconcile, encrypt, route-guards), `lib/`. Cost: path edits in
   `package.json`, `lint-script-guards` `DIRS`, `REAL_EXCUSED` keys, the
   `vitest.config.ts` import of `lib/`, and each lint's `..` becomes `../..`.
   One pass, gate green at the end.
3. Widen `lint:script-guards` to `scripts/`, `scripts/figma/` and
   `packages/*/scripts/`. Record excuses for `pull.mjs`, `capture.js` and the
   contracts generators.

## 3. Env and secrets

### Files today

| file | keys | note |
|---|---|---|
| `api/.env` (main lane) | 59 | real; loaded by `api/src/env.ts` by path; also by 3 contracts scripts |
| `api/.env.example` | 76 | 34 keys not in `api/.env`; 17 `api/.env` keys missing here |
| `frontend/.env` | 10 | Next loads it from `frontend/` |
| `frontend/.env.example` | 8 | missing 3 keys the real file has |
| `.env.example` (root) | 64 | stale: mixes api and frontend, `POSTGRES_*` for `docker-compose.yml` |
| `.env` (Jacob's checkout only) | 32 | legacy: `EMAIL_HOST/USER/PASSWORD/PORT`, `FEDEX_OAUTH_URL`, `POSTGRES_*`; used by `docker-compose.yml` (Postgres 15) |
| lanes `*/api/.env` | 18 copies, 57-59 keys | 4 lanes (`crm-facts`, `leads-api`, `orders-reads`, `pricing-resolver`) still hold `MINIO_*` and lack `S3_*`, `STAGING_DATABASE_URL`, `OLD_PROD_SERVER_DATABASE_URL` |
| lanes `*/frontend/.env` | 18 copies | same 9-10 keys |
| GitHub secrets | 2 | `RAILWAY_STAGING_TOKEN`, `PROD_READONLY_DATABASE_URL`; the rest is read from Railway at run time (`docs/waves/uat-env.md`) |
| Railway | per service | not readable from the repo; `uat-env.md` §4 is still "TBD" |

### Keys by class (names only)

| class | keys | where it should live |
|---|---|---|
| Secret, third party | `BETTER_AUTH_SECRET` `GOOGLE_CLIENT_SECRET` `FEDEX_CLIENT_SECRET` `FEDEX_TRACKING_CLIENT_SECRET` `FEDEX_SANDBOX_CLIENT_SECRET` `FEDEX_TRACKING_SANDBOX_CLIENT_SECRET` `STRIPE_SECRET_KEY` `STRIPE_WEBHOOK_SECRET` `RESEND_API_KEY` `RESEND_WEBHOOK_SECRET` `S3_ACCESS_KEY_ID` `S3_SECRET_ACCESS_KEY` `TURNSTILE_SECRET_KEY` `SPOT_API_KEY` `TWILIO_AUTH_TOKEN` `TWILIO_API_KEY_SECRET` `MOOV_SECRET_KEY` `MOOV_WEBHOOK_SECRET` `PLAID_SECRET` `PLAID_TRUIST_ACCESS_TOKEN` `GOOGLE_PLACES_API_KEY` | secret manager; Railway for deployed services |
| Secret, money at rest | `PAYOUT_ENCRYPTION_KEY` `PAYOUT_ENCRYPTION_KEY_PREVIOUS` | Railway only. Dev gets its own key. Never production's key on a laptop or in 18 lanes |
| Secret, database credentials | `DORADO_PASSWORD` `READONLY_PASSWORD` `PROD_READONLY_DATABASE_URL` `DUMP_SOURCE_DATABASE_URL` `REFRESH_ADMIN_DATABASE_URL` `STAGING_DATABASE_URL` `OLD_PROD_SERVER_DATABASE_URL` | secret manager, fetched per command (`op run`/`doppler run`); production URLs never in a lane file |
| Secret, tools | `FIGMA_TOKEN` `FIGMA_BOT_TOKEN` `TUNNEL__TOKEN` `TEST_PASSWORD` `NEXT_PUBLIC_SENTRY_AUTH_TOKEN` | secret manager. Rename the Sentry token to `SENTRY_AUTH_TOKEN`: it is build-time only (`next.config.ts`), and the `NEXT_PUBLIC_` prefix lets Next inline it into the browser bundle if client code ever names it |
| Config, not secret | client and account ids (`FEDEX_*_CLIENT_ID`, `*_ACCOUNT_NUMBER`, `GOOGLE_CLIENT_ID`, `PLAID_CLIENT_ID`, `MOOV_ACCOUNT_ID`, `MOOV_PUBLIC_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_TWIML_APP_SID`, `TWILIO_FROM_NUMBER`), URLs (`*_URL`, `*_HOST`), `FEDEX_RETURN_*`, `FEDEX_DORADO_*`, `EMAIL_FROM`, `S3_BUCKET/REGION/ENDPOINT/FORCE_PATH_STYLE`, `*_SCHEDULE`, `FEDEX_ENV` `PLAID_ENV` `SMS_PROVIDER` `TRUST_CLOUDFLARE` `LOG_LEVEL` `AUTH_COOKIE_DOMAIN` `MAIL_REDIRECT_TO` | committed per-environment file |
| Public (browser) | `NEXT_PUBLIC_API_URL` `_AUTH_URL` `_FRONTEND_URL` `_GOOGLE_MAPS_API_KEY` `_TURNSTILE_SITE_KEY` `_SENTRY_DSN` `_SENTRY_ENVIRONMENT` | committed per-environment file; Railway build args |
| Local only | `PGHOST` `PGPORT` `DORADO_USER` `READONLY_USER` `DEV_DATABASE` `TEST_DATABASE` `PROD_DATABASE` `TEST_DATABASE_URL` `BACKUP_DIR` `PG_BIN` `PG16_BIN` `PG_DUMP` `PLAYWRIGHT_CHROME` `SEED_ADMIN_PHONE` | per machine, gitignored |
| Tool knobs | `LINT_*_ROOT/_FLOOR`, `AUDIT_*`, `SCRIPT_GUARDS_*`, `REPLAY_*`, `WIRE_*`, `COMPARE_DB_FLOOR`, `RESET_JANUARY_*`, `ROUTE_GUARDS_*` (about 60) | not env-file keys; self-test overrides. Keep out of every example |
| No code reference found | `API_URL` `COLLECTING_NEXUS_TAXES` `RECAPTCHA_SECRET_KEY` `RECAPTCHA_THRESHOLD` `SPOT_UPDATE_SCHEDULE` `STALE_OFFERS_UPDATE_SCHEDULE` `OLD_PROD_SERVER_DATABASE_URL`; frontend `NEXT_PUBLIC_CAPTCHA_SITE_KEY` `_DORADO_PHONE_NUMBER` `_STRIPE_PUBLISHABLE_KEY` `_VOLUME_PATH` | confirm, then delete. `BETTER_AUTH_URL` has no code reference but better-auth reads it itself; keep it. `FIGMA_*` and `TUNNEL__TOKEN` are read by tools outside `src` |

### Proposed layout

```
env/
  README.md            the key table above; who owns each key
  api.example          every api key, empty or a sandbox placeholder
  frontend.example     every NEXT_PUBLIC_* key, plus SENTRY_AUTH_TOKEN
  dev.env              committed: config and public keys for dev; no secrets
  test.env             committed: TZ, NODE_ENV, loopback PGHOST/PGPORT, sandbox modes
  staging.env          committed: config only; secrets live in Railway
  production.env       committed: config only; secrets live in Railway
  load.ts              the one loader
```

`load.ts` reads, in order, later wins: `env/<DORADO_ENV>.env` (committed),
then the secrets file at `$DORADO_SECRETS` (default
`~/.config/dorado/<env>.secrets`, outside every worktree), then
`<lane>/.env.local` for lane overrides only (`TEST_DATABASE`,
`PORT`). `api/src/env.ts` keeps its composing logic and calls `load.ts`
first. The three contracts scripts call it in place of `dotenv` by path. The
frontend calls `@next/env` `loadEnvConfig` from `next.config.ts` on the same
files. `docker-compose.yml` and the root `.env.example` go; the compose file
runs Postgres 15 and is not the documented local cluster.

### Lanes without copies

A lane needs no secret file. `load.ts` reads the one secrets file outside
the repo, so `git worktree add` gives a working lane. `env.ts` already derives
`test_<branch>` from the worktree, so `TEST_DATABASE_URL` drops out of the
file. Removing the 18 `api/.env` and 18 `frontend/.env` copies also ends the
key drift seen in 4 lanes.

### Secrets plan

1. Pick one manager. 1Password CLI (`op run --env-file`) if Jacob already uses
   1Password; Doppler or Infisical if not. Railway stays the store for
   deployed services; GitHub stays at two secrets.
2. Into the manager: every row marked secret above. Production database URLs
   and `PAYOUT_ENCRYPTION_KEY` go in a separate vault that agents and lanes
   cannot read; audits fetch `PROD_READONLY_DATABASE_URL` per run.
3. Stays local: the local-only row.
4. Placeholders in examples: sandbox modes (`FEDEX_ENV=sandbox`,
   `PLAID_ENV=sandbox`, `SMS_PROVIDER=console`), test-mode key prefixes,
   empty strings for the rest.
5. Rotate after the move any secret that sat in lane copies: 18 copies on one
   disk is the exposure.
6. Add `audit:env-keys`: every key in code is in an example, every example
   key is read by code or listed as tool-read. That catches today's 51-key
   drift.

## 4. Docs

### Today

| location | files | lines | holds |
|---|---|---|---|
| `CLAUDE.md`, `AGENTS.md` (root; `frontend/` has its own pair) | 4 | ~420 | agent instructions |
| `FOLLOWUPS.md` (root) | 1 | 654 | open work, decisions waiting on Jacob |
| `docs/rulings.md` | 1 | 660 | the law |
| `docs/waves/` | 60 | 13,531 | plans, runbooks, conventions, handoffs and UAT logs in one folder |
| `docs/design/` | 32 + `orders-port-review/` (6) | 10,440 | screen specs, API gaps, 6 Figma comment logs, 4 JSON snapshots |
| `docs/model/` | 2 | 1,248 | lots and spots-history models |
| `docs/reviews/` | 10 | 3,812 | the four-reviewer audit and its fix lanes |
| `docs/history/` | 7 + `waves/` (17) | 22,527 | archive |
| `.claude/tmp/` | 10 tracked | — | agent briefs, committed by accident |
| package READMEs, `scripts/figma/README.md`, `api/tests/cassettes/README.md`, `frontend/shared/tests/README.md` | 8 | — | local to their folder; keep |

The comment logs exist in every lane (18 copies of 6 files). Each lane
appends to its own copy, so every merge can conflict.

### Proposed

```
docs/
  README.md        index: one line per file
  rulings.md       unchanged path (cited everywhere)
  followups.md     from root FOLLOWUPS.md
  runbooks/        things a person runs
  conventions/     how code is written
  plans/           active waves only
  design/
    screens/  api-gaps/  comments/  snapshots/  port-review/
  model/
  reviews/
  history/         finished waves, handoffs, UAT logs
```

| from | to |
|---|---|
| `FOLLOWUPS.md` | `docs/followups.md` (update `CLAUDE.md`, memory, every citing doc in one pass) |
| waves: `production-chain`, `local-postgres`, `uat-env`, `uat-rehearsal`, `lots-backfill-production`, `phones-backfill` | `runbooks/` |
| waves: `frontend-conventions`, `domains`, `rest-routes`, `no-dictionaries`, `providers-by-business`, `test-suite-redesign`, `responsive-type`, `navigation` | `conventions/` |
| waves: `handoff-*` (3), `frontend-sync-*` (3), `uat-0912`, `uat-0913`, `e2e-2026-09-07`, `docs-pass`, `frontend-nuke` | `history/waves/` |
| waves: every other file (about 37) | `plans/`; each moves to `history/` when its wave merges |
| `waves/lot-model.md` | `model/` beside `lots.md` |
| design `*-api-gaps*`, `api-gaps-*` | `design/api-gaps/` |
| design `*-comments-log.md`, `people-comments-*.md` | `design/comments/`; appended on `dev` only, never in a lane |
| design `*-snapshot-*.json` | `design/snapshots/` |
| design `*-screens.md`, `*-tab.md`, `*-accordions.md`, `statuses.md`, `communications-plan.md` | `design/screens/` |
| design `worker-protocol.md` | `conventions/` |
| `.claude/tmp/*` | delete from git; add to `.gitignore` |

Cost: path edits in `CLAUDE.md`, memory files, and docs that cite each
other. A one-off script can list every `docs/...` reference before and after.
No code reads these paths except the `scripts/figma` comment tooling; check it
for the comment-log paths first.

## Recommendation

1. Tests: no change (decided).
2. Scripts: keep per package; split `api/scripts/` by verb; widen
   `lint:script-guards` to every script folder.
3. Env: one committed config file per environment and one example per app
   under `env/`, secrets in one manager and outside every worktree, one
   loader. Stop copying `.env` into lanes. Rename the Sentry token. Keep
   production key material off disk.
4. Docs: split `docs/waves` into runbooks, conventions, plans and history;
   give comment logs one home on `dev`; move `FOLLOWUPS.md` under `docs/`.

Order: env first (it removes a real exposure), then docs, then the scripts
split. Each is one lane and one gate.
