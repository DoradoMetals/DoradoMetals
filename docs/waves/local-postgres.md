# A local PostgreSQL 16, without root — phase 5 task 1

**DONE 2026-08-29.** The suite went from *uncompletable* to **992 tests, 992
pass, 0 fail, 20 seconds.**

D198 measured the problem: `DATABASE_URL` points at `switchback.proxy.rlwy.net`
and `SELECT 1` costs a **126 ms** median round trip with jitter to 1.5 s. Every
`BEGIN`, advisory lock, query and `ROLLBACK` in a ~1000-test suite pays it. On a
bad evening the gate advanced three log lines in thirty minutes on an idle
machine.

Local: **0.19 ms median.** ~660× on the term that dominates everything.

## It did NOT need `sudo apt install`

That was the ask in the earlier version of this file, and it was wrong — or
rather, it was one way and not the only way. `postgresql-16` (the SERVER; only
`postgresql-client-16` was installed) can be fetched and unpacked entirely as a
normal user:

```bash
apt-get download postgresql-16                 # no root
dpkg -x postgresql-16_*.deb ~/pgroot           # no root
```

`dpkg -x` extracts without touching dpkg's database or any system path.

**Keep the Debian directory layout.** Flattening the binaries into `~/pg16/bin`
fails: `postgres` resolves its share directory relative to its own location, so
it looked for `/usr/share/postgresql/16/timezonesets` and died in the bootstrap
script. Copying `usr/` wholesale to `~/pgroot/usr/` fixes it, because
`~/pgroot/usr/lib/postgresql/16/bin/postgres` then resolves
`~/pgroot/usr/share/postgresql/16/` correctly.

## The full recipe

```bash
B=~/pgroot/usr/lib/postgresql/16/bin

$B/initdb -D ~/pgdata16 -U "$(whoami)" -E UTF8 --locale=C

# unix_socket_directories, or it dies on /var/run/postgresql (not writable)
mkdir -p ~/pgsock
$B/pg_ctl -D ~/pgdata16 -l ~/pgdata16/server.log \
  -o "-p 5544 -c max_connections=200 -c unix_socket_directories=$HOME/pgsock" start

psql -h 127.0.0.1 -p 5544 -d postgres -c 'create database test'

# THE 16 CLIENT, not the 14 on PATH - plain `pg_dump` is 14.24 here and
# refuses with "server version mismatch"
/usr/lib/postgresql/16/bin/pg_dump --no-owner --no-privileges -d "$DEV_URL" -f dev.sql
/usr/lib/postgresql/16/bin/psql -h 127.0.0.1 -p 5544 -d test -f dev.sql

TEST_DATABASE_URL="postgresql://$(whoami)@127.0.0.1:5544/test" USE_TEST_DB=1 \
  TZ=UTC NODE_ENV=test node --test
```

`USE_TEST_DB=1` already existed and already refuses to point anywhere but a
database named `test`. Nothing in `env.ts` needed changing.

## SSL IS REQUIRED, AND THAT IS THE ONE NON-OBVIOUS STEP

The first full run was **353 pass / 665 fail**, and every single failure was the
same line:

```
Error: The server does not support SSL connections
```

`api/db.ts` hardcodes `ssl: { rejectUnauthorized: false }` — reasonable against
Railway, and it means the pool **cannot talk to a Postgres without TLS at all.**
665 failures, one cause.

Fixed on the SERVER rather than in `db.ts`, deliberately: `db.ts` is on the path
of every request in production, and a self-signed cert costs nothing.

```bash
cd ~/pgdata16
openssl req -new -x509 -days 3650 -nodes -text \
  -out server.crt -keyout server.key -subj "/CN=localhost"
chmod 600 server.key
printf "\nssl = on\nssl_cert_file = 'server.crt'\nssl_key_file = 'server.key'\n" >> postgresql.conf
```

Restart, and it is 992/992.

**Worth considering separately** (NOT done): making `db.ts` skip TLS for
`localhost`/`127.0.0.1`. It is standard, it would remove this step, and it
touches every request path — so it wants its own commit and its own gate run
rather than riding along here.

## What this is and is not

**It is** a faithful copy of DEV — `pg_dump`/restore ran with **0 errors**, and
row counts match exactly: 36 `orders.orders`, 31 `orders.transactions`, 22
`payments.details`, 62 `products.bullion`, 12 `exchange.users`, 19 schemas.

**It is not** a replacement for the remote database, and it is not automatically
fresh. It is a snapshot taken at a moment; re-dump when dev moves. The
`env.ts` note saying the switch was "NOT USABLE YET" was about `test` being
rebuilt from a PRODUCTION backup, where eight schemas do not exist and every
`repo.next` test would read zero rows. **A copy of dev has no such gap** — that
is the whole reason this works.

**It also removes a standing hazard.** The suite currently writes to the same
remote dev database the application uses, which is how `tracking.test.js` once
deleted the real FedEx history of five dev shipments (`audit:test-leaks` exists
because of it). Against a local copy that class of accident costs nothing.

## Durability

`~/pgroot` (binaries), `~/pgdata16` (cluster), `~/pgsock` (socket) all live in
the home directory and survive the session. The cluster is **not** started at
boot — re-run the `pg_ctl start` line above. `sudo apt install -y postgresql-16`
is still the tidier long-term answer; this proves the work does not have to wait
for it.


---

# THE PIVOT — `provision:test`, and what still has to happen

Jacob, 2026-08-30: *"at a certain point we need to pivot to the test db."*

The blocker was never the switch. `USE_TEST_DB=1` and `test:on-test-db` have
both existed for some time, and `env.ts` already refuses to point them anywhere
but a database named `test`. What did not exist was a way to **fill** `test`
with something the suite could run against.

`refresh:test` fills it from a **production** archive, and `env.ts` records why
that has never been usable: production has no `leads`, `rates`, `reviews`,
`products`, `metals` or `media` schema, the migrations create them empty, and
every `repo.next` test then reads zero rows. That is the same blocker as
promotion and it is not moving soon.

`provision:test` fills it from **dev** instead, which is where the migrations
have actually run. That is the whole difference.

```bash
pnpm --filter @dorado/api provision:test              # dry run
pnpm --filter @dorado/api provision:test -- --commit  # rebuild
pnpm --filter @dorado/api test:on-test-db             # 992/992 in 21s
```

Verified end to end: dropped 19 schemas, dumped 1.2 MB from dev, restored 19
schemas, **992 tests / 992 pass / 0 fail / 21 s** on the rebuilt database.

## Its guards, because it destroys the target

Modelled on `refresh-from-backup.mjs`, which does the same job from an archive:

- **an allowlist of target NAMES** — `test`, and nothing else. A name nobody
  taught it about is refused rather than accepted.
- **a `system_identifier` comparison**, asked of both servers, so two URLs that
  spell different names but reach one database are caught. This survives a
  renamed URL, which a string comparison does not.
- **dry by default.** `--commit` is the only path that writes.
- **a schema-count floor after restoring.** `psql` and `pg_restore` both recover
  from errors and can exit 0 having quietly dropped a table's data — the defect
  `compare:databases` exists for. Fewer schemas out than in is a hard failure.

**No `--self-test`, and excused as an `action`** in `lint-script-guards.mjs`,
exactly as `refresh-from-backup.mjs` is: every path that does anything writes,
and the harness's required `pass` case could only be a dry run against two
reachable databases. All four refusals were exercised by hand and each exits 1.

## WHAT IS NOT DONE, AND IT IS THE ACTUAL PIVOT

Two of the three blockers below are now CLOSED.

1. ~~The cluster is not started at boot~~ — **`scripts/preflight-test-db.ts`**
   runs before the suite and refuses with the exact `pg_ctl` line when the
   cluster is down. It also catches the two states that look identical from
   outside: reachable but never provisioned, and reachable but empty of users.
   And it catches the combination that looks *right* and is not — `USE_TEST_DB=1`
   pointed at the REMOTE `test`, which `env.ts` composes by default and which is
   filled from a production archive missing eight schemas. That one prints the
   `.env` line to fix it, with the password redacted.

2. ~~`db.ts` hardcodes `ssl`~~ — **it now skips TLS for loopback only**
   (`127.0.0.1`, `::1`, `localhost`). Everything else keeps exactly the
   connection it had, so Railway and the read-only production URL are untouched.
   Verified both ways in one sitting: loopback connects with `ssl false`, dev
   connects with `ssl true`. The self-signed cert is no longer required.

3. **The snapshot still goes stale.** It is a copy of dev at a moment.
   `provision:test -- --commit` is one command and takes seconds, but nothing
   reminds anyone. Left open deliberately — a staleness check wants a cheap
   fingerprint to compare, and inventing one badly is worse than the reminder.

## THE ONE LINE THAT IS NOT MINE TO WRITE

`TEST_DATABASE_URL` lives in `api/.env`, which holds credentials and is Jacob's.
`env.ts` composes it from `PGHOST` by default, which names the **remote** test
database — the unusable one. So the last step is one line:

```
TEST_DATABASE_URL=postgresql://jtj60@127.0.0.1:5544/test
```

After that:

```bash
pnpm --filter @dorado/api provision:test -- --commit
pnpm --filter @dorado/api test:on-test-db      # 992/992, 21s
```

**And then flipping `test` itself is a one-word edit** in `api/package.json` —
point `test` at what `test:on-test-db` runs, and keep `test:on-dev` as the
escape hatch. It is deliberately NOT done here: until that `.env` line exists,
flipping it would break `pnpm check` for everyone including Jacob, and a pivot
that breaks the gate on the first run is a pivot that gets reverted.

---

**FLIPPED, 2026-09-03.** The `.env` line above was already in place. `test` in
`api/package.json` is now the preflight + `USE_TEST_DB=1` run; `test:on-test-db`
is gone (there is nothing left for it to alias) and `test:on-dev` stays as the
escape hatch. The preflight also now keeps the local database migrated on its
own — see `docs/waves/phase5-fast-gate.md` task 1 — so provisioning once and
letting the preflight carry it forward is the whole workflow.
