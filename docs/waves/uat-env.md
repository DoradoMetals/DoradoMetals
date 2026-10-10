# UAT environment (2026-10-09)

Goal: a deployed copy of the redone app, running `dev`, against a
production-shaped database, that Jacob can click through. Promotion to
production and migrate-on-deploy for production wait until the redone app is
on prod (Jacob, 2026-10-09); they are sketched in §6 so nothing is forgotten.

Railway today: one project, environment `production`, five services —
`api` (GitHub, api.doradometals.com), `frontend` (GitHub,
www.doradometals.com), `Postgres` (volume), `Bucket` and `Console` (object
storage and its console, volume). Railway auto-deploys `master`.

## 1. Create the environment (Railway) — done 2026-10-09 as `staging`

1. Project › Settings › Environments › **New environment** `staging`,
   duplicated from `production` so all five services exist. Volumes are not
   copied: `Postgres` and `Bucket` start empty in `staging`. The duplicated
   `Bucket` fails to pull `minio/minio:latest` (MinIO left Docker Hub); set its
   image to `quay.io/minio/minio:latest` (and `quay.io/minio/console:latest`
   for `Console` if it is a MinIO image). Do not redeploy production's Bucket.
2. `api` service in `staging` › Settings › Source: branch **`dev`**; keep Root
   Directory `/` and `RAILWAY_DOCKERFILE_PATH=api/Dockerfile`. Same for
   `frontend` with `frontend/Dockerfile`.
3. Domains in `staging`: `api-uat.doradometals.com` on `api`,
   `uat.doradometals.com` on `frontend` (CNAMEs in the DNS zone), or the
   Railway-generated domains if DNS is a bother; the frontend's
   `NEXT_PUBLIC_*` build args must name whichever is chosen.
4. Variables in `staging`: the checklist in §4. Third parties in test mode only.
5. `api` › Settings › Deploy › **Pre-deploy command**:
   `pnpm --filter @dorado/api migrate`, with `MIGRATE_ALLOW_DB=<uat db name>`
   set in the `staging` environment only. Not set in `production`.

## 2. Build the UAT database once (the rehearsed chain)

Against the `staging` Postgres public TCP URL (Railway › Postgres › Connect),
from WSL, with the Postgres 16 client:

```
pg_restore --no-owner --no-privileges -d "$UAT_URL" dorado-prod-YYYYMMDD.dump
pnpm --filter @dorado/api compare:databases    # dump copy vs local copy: whole
DATABASE_URL=$UAT_URL pnpm --filter @dorado/api migrate:reset-january --database <name> --url $UAT_URL --dump <file> --commit
DATABASE_URL=$UAT_URL MIGRATE_ALLOW_DB=<name> pnpm --filter @dorado/api migrate
DATABASE_URL=$UAT_URL pnpm --filter @dorado/api verify:genesis && verify:backfill && audit:coverage && audit:constraints && audit:nullability && validate:wire
DATABASE_URL=$UAT_URL pnpm --filter @dorado/api encrypt:payouts            # needs the key
```

`docs/waves/production-chain.md` is the authority for each step; this is the
same sequence on a copy where mistakes cost nothing. The dump on disk is
`/home/jtj60/dorado-prod-20260825.dump` (Aug 25); a fresher one needs an
owner-role credential (runbook §0). `pnpm uat:refresh` (§5) wraps the chain.

## 3. Seed what UAT needs that the dump does not hold

- An admin sign-in for Jacob: `pnpm seed` creates the e2e users from
  `SEED_ADMIN_PHONE`; sign-in is email-first now, so the seed must set the
  admin email as well (check `api/scripts/seed*`).
- Spots: `spots.sources` is seeded with `nfusion`; the feed job needs the
  nFusion credential or UAT prices read stale. Decide: real feed (read-only,
  harmless) or a fixed spot set.
- Bucket: empty; PDFs and photos generate into it as orders are touched.

## 4. Variables (from the checklist in `scratchpad/uat/env-checklist.md`)

TBD once the checklist lands: required vs optional, build-time `NEXT_PUBLIC_*`
on the frontend, and which third-party keys are test-mode (Stripe test keys,
FedEx sandbox account, Twilio test credentials or a separate number, Resend
sandbox sender, Sentry `environment=uat`, Turnstile test keys).

## 5. `pnpm uat:refresh` (built in lane ci-workflows; see below)

One guarded script that runs §2 end to end against a URL passed explicitly,
refuses any URL whose host matches production, requires the dump path, and
prints counts only. Lives in `api/scripts/uat-refresh.mjs` with a self-test,
registered in `lint:script-guards`.

## 6. Later: promote and migrate-on-deploy for production

- GitHub Actions `promote.yml`, `workflow_dispatch`: fast-forward `master` to
  `dev` only when `check.yml` is green on that commit; Railway's "Wait for CI"
  toggle on both services.
- Production's first migration run is the big-bang chain in
  `production-chain.md`, Jacob's to run once. After it, the same pre-deploy
  command as UAT, with `MIGRATE_ALLOW_DB` set for production.
- `check.yml` gains a Postgres service so the `dev-db` gate members run in CI.

## Decisions on 2026-10-09

- The environment is `staging`, duplicated from `production`. Duplicate copies services, variables and config only; volumes start empty.
- The duplicated Postgres composes `DATABASE_URL` from `PGDATABASE`, which was copied as `prod`. That is only the database name inside staging's own Postgres (private DNS resolves per environment). It is renamed to `staging` so that `MIGRATE_ALLOW_DB=staging` can never be mistaken for production.
- Object storage: MinIO is unavailable on every public registry and its last free build is vulnerable. Staging uses a Railway native Bucket (Create -> Bucket, same region as the api). The api reads `S3_*` names after the `env-hardening` lane lands.
- `STAGING_DATABASE_URL` is the TCP-proxy URL of staging's Postgres, held in api/.env only, never printed.

## CI, deploys and the nightly refresh (lane ci-workflows, 2026-10-10)

### The secrets to add (repo -> Settings -> Secrets and variables -> Actions)

| secret | used by | value |
|---|---|---|
| `RAILWAY_STAGING_TOKEN` | `deploy-staging.yml`, `refresh-staging.yml` | a Railway project token scoped to the `staging` environment only |
| `STAGING_DATABASE_URL` | `refresh-staging.yml` | the `staging` Postgres connection string (public TCP proxy), database name must be exactly `staging` |
| `PROD_READONLY_DATABASE_URL` | `refresh-staging.yml` | the existing read-only production credential (same one audits already use) |
| `STAGING_PAYOUT_ENCRYPTION_KEY` | `refresh-staging.yml` | a 32-byte base64 key, generated once for staging the same way the real one was: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` - never reuse production's key |

`refresh-staging.yml` also sets `PAYOUT_ENCRYPTION_KEY_ID=k-staging-1` as a
literal in the workflow (not a secret) so staging's sealed values are visibly
under a different key id than production's `k1`.

**Not in the list above, and deliberately optional:** `DEV_DATABASE_URL`. See
"The open gap" below - `check.yml` only uses it, and only if it is present.

### What each workflow does

- **`check.yml`** - the PR/push gate. Runs on push to `dev` and `master` and
  on every pull request, one concurrency group per ref (a new push cancels
  the old run). Brings up a `postgres:16` service container (db/user/password
  all `test`) for the local test database `preflight-test-db.ts` requires, then
  runs the existing lint:db/lint:migrations/typecheck steps, `pnpm check:fast`
  (every api lint, typecheck, `test:coverage`, the Figma snapshot checks),
  `icons`/`components`/`client` typecheck and test, and the frontend typecheck.
  No step touches the real dev or production database.
- **`deploy-staging.yml`** - on push to `dev`, once `check` finishes
  successfully there (via `workflow_run`, not a `needs:` chain - see the
  comment in the file for why that is the reliable choice across two separate
  workflow files), installs the Railway CLI and runs
  `railway up --service api --detach --ci` then the same for `frontend`,
  against the token above. Also runs on `workflow_dispatch` for a manual
  deploy.
- **`refresh-staging.yml`** - daily at 09:00 UTC, plus `workflow_dispatch`.
  Installs the Postgres 16 client tools, then
  `pnpm uat:refresh --from "$PROD_READONLY_DATABASE_URL" --dump-out "prod-backup-<date>.dump" --commit`.
  The dump that step produces is uploaded as a workflow artifact
  (`prod-backup-<date>`, 30-day retention) before anything else runs - that
  upload doubles as the daily off-site backup, independent of whether the
  refresh itself succeeds. On success, it restarts the `staging` api service
  (`railway redeploy --service api --yes`) so its connection pool picks up the
  database that was just renamed into place; migrations already ran inside the
  script, against the scratch copy, before the rename.

### Running the refresh by hand

```bash
# dry run - validates everything, touches no database
pnpm uat:refresh --from "$PROD_READONLY_DATABASE_URL"

# the real thing
pnpm uat:refresh --from "$PROD_READONLY_DATABASE_URL" --commit

# from a dump you already have
pnpm uat:refresh --dump /path/to/prod.dump --commit

# drop the previous cycle's staging_prev immediately instead of keeping it
pnpm uat:refresh --from "$PROD_READONLY_DATABASE_URL" --commit --drop-previous

# the refusal-rule self-test, no database needed
pnpm --filter @dorado/api refresh:staging:self-test
```

It refuses before touching anything unless the target database is named
exactly `staging`, and unless the target's host:port differs from
`PROD_READONLY_DATABASE_URL`'s (when that var is set) - so a secret pasted
into the wrong field cannot reach production. Everything happens against a
scratch `staging_next` first; `staging` itself is renamed into place only
after `reset-january`, `migrate`, all four verifiers and
`encrypt-payouts --commit`/`--verify` have each exited 0 against the scratch
copy. The previous `staging` is kept as `staging_prev` for one cycle (dropped
at the start of the next run) unless `--drop-previous` is passed.

### The open gap: `check.yml`'s test database starts empty

`preflight-test-db.ts` refuses to run the suite against a local test database
with no `exchange` schema, and `exchange`'s DDL exists nowhere in this repo -
it is real historical data that predates the refactor, restored by hand onto
dev once and never scripted since (`docs/waves/local-postgres.md`). A bare
`postgres:16` service container in CI has no such schema, so `api:test`
inside `check:fast` will fail at the preflight step with its own explanatory
message until the test database is provisioned from somewhere that already
has it.

`check.yml` has one opt-in step for this: if a `DEV_DATABASE_URL` secret is
set (read access to the real dev database - `provision:test` only ever
`SELECT`s from it), the job runs `provision:test -- --commit` against the
service container before `check:fast`. Without that secret the step is
skipped and `check:fast` fails at exactly that one lint member, with every
other lint, typecheck and the Figma checks still reporting their own result.
Production is not a substitute source: it is missing the `leads`, `rates`,
`reviews`, `products`, `metals` and `media` schemas, so a production-sourced
test database would still fail most `test:db`/`test:http` cases on empty
reference tables.

Adding `DEV_DATABASE_URL` is a real decision - it puts dev credentials in a
PR-triggered workflow's blast radius - which is why this was left for Jacob
rather than decided here.
