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
