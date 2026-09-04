// Seals the bank details into payments.details, and is the script that migration
// 073 and verify-backfill.mjs have both cited since the day they were written.
//
// *** IT DID NOT EXIST. *** 073's header says routing and account numbers "are
// written separately, and encrypted, by scripts/encrypt-payout-details.mjs,
// which refuses to run without PAYOUT_ENCRYPTION_KEY". verify-backfill.mjs
// excludes the two columns from its comparison on the same understanding. Both
// were describing a design, in the present tense, that nobody had built - so the
// plaintext stayed plaintext on 18 production payouts (10 ACH, 8 WIRE) and the
// documentation read as though the problem were solved. This is that script.
//
// *** NAMED .ts, NOT .mjs. *** The two citations say `.mjs`. They are updated to
// point here rather than this file being misnamed to match them: scripts/ is
// mid-conversion to TypeScript (D157) and a new script arriving in the old
// extension would be work to undo. Writing the file the citation named, when the
// citation was itself the thing that was wrong, is how the original defect got in.
//
//   node scripts/encrypt-payout-details.ts               report only, writes nothing
//   node scripts/encrypt-payout-details.ts --commit      seal and write
//   node scripts/encrypt-payout-details.ts --verify      decrypt and compare
//   node scripts/encrypt-payout-details.ts --rotate      re-seal under a new key
//   node scripts/encrypt-payout-details.ts --check-key   validate the key, no database
//   node scripts/encrypt-payout-details.ts --self-test   attack the refusals
//
// *** NOTHING HERE PRINTS A BANK NUMBER. *** Not on success, not on failure, not
// in a count, not in a sample row. Every line of output is an id, a count or a
// verdict. `shared/crypto/tests/envelope.test.ts` pins the same property on the
// cipher's error paths. CLAUDE.md's oldest standing constraint is "never log or
// return bank details", and a script written to fix the exposure is the worst
// possible place to create a new one.
//
// *** IT REFUSES TO CALL AN EMPTY RUN A SUCCESS. *** Dev holds sixteen payouts
// and not one bank number - every one is ECHECK or DORADO_ACCOUNT - so the
// happy path here processes zero rows on the only database it will ever be
// tested against. That is exactly the shape this codebase has shipped six times
// (D95, D99, D108, D115, D157, D176): a script that walks nothing, reports
// success, and is believed. Zero candidates is a NON-ZERO exit unless
// --allow-empty says the operator meant it.
//
// *** IT DOES NOT CLEAR THE PLAINTEXT. *** Write, verify, and only then a
// separate migration clears exchange.payouts - a destructive change to
// `exchange`, needing the `allow-destructive:` marker, a stated backup and
// Jacob. This script only ever adds ciphertext.
import "#env";
import pool from "#pool";
import type { PoolClient } from "pg";
import { parseKey, seal, open, aadFor, isEnvelope, keyIdOf, type Key } from "#shared/crypto/envelope.ts";

const args = new Set(process.argv.slice(2));
const COMMIT = args.has("--commit");
const VERIFY = args.has("--verify");
const ROTATE = args.has("--rotate");
const CHECK_KEY = args.has("--check-key");
const ALLOW_EMPTY = args.has("--allow-empty");

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

// --- self-test, before anything opens a connection ------------------------
if (process.argv.includes("--self-test")) {
  const { selfTest } = await import("./lib/self-test-harness.ts");
  const good = Buffer.alloc(32, 7).toString("base64");
  await selfTest({
    script: new URL(import.meta.url).pathname,
    cases: [
      { name: "refuses with no key at all", expect: "fail",
        args: ["--check-key"], env: { PAYOUT_ENCRYPTION_KEY: "" },
        mustPrint: "PAYOUT_ENCRYPTION_KEY" },
      { name: "refuses a key that is not 32 bytes", expect: "fail",
        args: ["--check-key"], env: { PAYOUT_ENCRYPTION_KEY: Buffer.alloc(16, 7).toString("base64") },
        mustPrint: "must be 32 bytes" },
      { name: "refuses a key id containing the separator", expect: "fail",
        args: ["--check-key"], env: { PAYOUT_ENCRYPTION_KEY: good, PAYOUT_ENCRYPTION_KEY_ID: "k.1" },
        mustPrint: "key id must match" },
      { name: "refuses two modes at once", expect: "fail",
        args: ["--commit", "--verify"], env: { PAYOUT_ENCRYPTION_KEY: good },
        mustPrint: "one mode at a time" },
      { name: "refuses --rotate without the previous key", expect: "fail",
        args: ["--rotate", "--check-key"], env: { PAYOUT_ENCRYPTION_KEY: good, PAYOUT_ENCRYPTION_KEY_PREVIOUS: "" },
        mustPrint: "PAYOUT_ENCRYPTION_KEY_PREVIOUS" },
      { name: "accepts a valid key", expect: "pass",
        args: ["--check-key"], env: { PAYOUT_ENCRYPTION_KEY: good },
        mustPrint: "key is valid" },
    ],
  });
}

// --- mode and key validation, still before any connection -----------------
const modes = [COMMIT, VERIFY, ROTATE].filter(Boolean).length;
if (modes > 1) {
  die("one mode at a time: --commit, --verify and --rotate are mutually exclusive");
}

const raw = process.env.PAYOUT_ENCRYPTION_KEY;
if (!raw) {
  die(
    "PAYOUT_ENCRYPTION_KEY is not set, and this script will not run without it.\n" +
    "That is the point: a database can be migrated by someone who does not hold\n" +
    "the key. Generate one with:\n" +
    "  node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
  );
}

let key: Key;
try {
  key = parseKey(process.env.PAYOUT_ENCRYPTION_KEY_ID ?? "k1", raw);
} catch (e) {
  die(String((e as Error).message));
}

// Rotation needs both keys: the one rows are sealed under now, and the one they
// are moving to. Without the previous key the ciphertext cannot be opened, and
// re-sealing from exchange plaintext instead would silently succeed on rows
// whose plaintext has since been cleared.
let previous: Key | null = null;
if (ROTATE) {
  const prevRaw = process.env.PAYOUT_ENCRYPTION_KEY_PREVIOUS;
  if (!prevRaw) {
    die(
      "--rotate needs PAYOUT_ENCRYPTION_KEY_PREVIOUS: the key the rows are sealed\n" +
      "under today. Rotation re-seals ciphertext, it does not re-read plaintext."
    );
  }
  try {
    previous = parseKey(process.env.PAYOUT_ENCRYPTION_KEY_PREVIOUS_ID ?? "k1", prevRaw);
  } catch (e) {
    die(String((e as Error).message));
  }
  if (previous.id === key.id) {
    die(`--rotate: the previous key id and the new one are both '${key.id}' - ` +
        "set PAYOUT_ENCRYPTION_KEY_ID to the new id, or there is nothing to rotate to");
  }
}

if (CHECK_KEY) {
  console.log(`key is valid: id '${key.id}', 256-bit${ROTATE ? `, rotating from '${previous!.id}'` : ""}`);
  process.exit(0);
}

// --- from here on there is a database -------------------------------------
type Row = {
  id: string;
  routing_number: string | null;
  account_number: string | null;
  routing_number_encrypted: string | null;
  account_number_encrypted: string | null;
  encryption_key_id: string | null;
};

const COLUMNS = [
  { plain: "routing_number", sealed: "routing_number_encrypted" },
  { plain: "account_number", sealed: "account_number_encrypted" },
] as const;

// Which database this is, printed the way migrate.mjs prints it. An operator
// running this holds the key to real customer bank details; they should never
// have to infer which database they are pointed at.
{
  const u = process.env.DATABASE_URL ?? "";
  const m = u.match(/@([^/]+)\/([^?]+)/);
  console.log(`database: ${m ? `${m[2]} @ ${m[1]}` : "(unparsed DATABASE_URL)"}`);
  console.log(`key: '${key.id}'${ROTATE ? ` <- '${previous!.id}'` : ""}`);
  console.log(`mode: ${COMMIT ? "COMMIT" : VERIFY ? "VERIFY" : ROTATE ? "ROTATE" : "report only (no writes)"}\n`);
}

const client: PoolClient = await pool.connect();
let exitCode = 0;

try {
  // The join is on id, which 073 established: a details row KEEPS its payout's
  // id. If that ever changes this returns zero rows, which is why zero is an
  // error rather than a shrug.
  const { rows } = await client.query<Row>(`
    SELECT d.id,
           p.routing_number,
           p.account_number,
           d.routing_number_encrypted,
           d.account_number_encrypted,
           d.encryption_key_id
      FROM payments.details d
      JOIN exchange.payouts p ON p.id = d.id
     ORDER BY d.id
  `);

  const needsSealing = rows.filter((r) =>
    COLUMNS.some((c) => r[c.plain] != null && r[c.sealed] == null));
  const alreadySealed = rows.filter((r) =>
    COLUMNS.some((c) => isEnvelope(r[c.sealed])));

  console.log(`${rows.length} payout account(s) joined payments.details to exchange.payouts`);
  console.log(`  ${needsSealing.length} with plaintext and no ciphertext`);
  console.log(`  ${alreadySealed.length} already sealed`);

  // A row whose sealed column holds something that is not an envelope is the
  // one state no mode should touch: it is not plaintext to seal and not
  // ciphertext to open. Report and refuse.
  const corrupt = rows.filter((r) =>
    COLUMNS.some((c) => r[c.sealed] != null && !isEnvelope(r[c.sealed])));
  if (corrupt.length) {
    console.error(`\n${corrupt.length} row(s) hold a value that is not a v1 envelope:`);
    for (const r of corrupt) console.error(`  ${r.id}`);
    die("refusing to proceed - these are neither plaintext nor ciphertext");
  }

  if (VERIFY) {
    let checked = 0, mismatched = 0, unopenable = 0;
    for (const r of rows) {
      for (const c of COLUMNS) {
        const sealedValue = r[c.sealed];
        if (!isEnvelope(sealedValue)) continue;
        checked += 1;
        let opened: string;
        try {
          opened = open(sealedValue as string, key, aadFor(r.id, c.plain));
        } catch (e) {
          unopenable += 1;
          console.error(`  ${r.id} ${c.sealed}: ${(e as Error).message}`);
          continue;
        }
        // Compared, never printed - not the plaintext, not the decrypted value,
        // not a diff of the two. The row id and the verdict are the whole report.
        if (r[c.plain] != null && opened !== r[c.plain]) {
          mismatched += 1;
          console.error(`  ${r.id} ${c.sealed}: decrypts to something other than the exchange plaintext`);
        }
      }
    }
    console.log(`\nverified ${checked} sealed value(s): ${mismatched} mismatched, ${unopenable} unopenable`);
    if (checked === 0 && !ALLOW_EMPTY) {
      die("\nNOTHING WAS VERIFIED. Zero sealed values were found, and a run that\n" +
          "checks nothing must not exit 0 - that is how a broken script goes\n" +
          "unnoticed for months. Pass --allow-empty if an empty database is expected.");
    }
    if (mismatched || unopenable) exitCode = 1;
  } else if (ROTATE) {
    const toRotate = rows.filter((r) =>
      COLUMNS.some((c) => isEnvelope(r[c.sealed]) && keyIdOf(r[c.sealed] as string) === previous!.id));
    console.log(`  ${toRotate.length} sealed under '${previous!.id}' and due for rotation`);
    let rotated = 0;
    for (const r of toRotate) {
      const next: Record<string, string | null> = {};
      for (const c of COLUMNS) {
        const sealedValue = r[c.sealed];
        if (!isEnvelope(sealedValue) || keyIdOf(sealedValue as string) !== previous!.id) continue;
        const aad = aadFor(r.id, c.plain);
        next[c.sealed] = seal(open(sealedValue as string, previous!, aad), key, aad);
      }
      if (Object.keys(next).length === 0) continue;
      await client.query(
        `UPDATE payments.details
            SET routing_number_encrypted = COALESCE($2, routing_number_encrypted),
                account_number_encrypted = COALESCE($3, account_number_encrypted),
                encryption_key_id = $4,
                updated_at = now()
          WHERE id = $1`,
        [r.id, next.routing_number_encrypted ?? null, next.account_number_encrypted ?? null, key.id]
      );
      rotated += 1;
    }
    console.log(`\nrotated ${rotated} row(s) to '${key.id}'`);
    if (rotated === 0 && !ALLOW_EMPTY) {
      die("\nNOTHING WAS ROTATED. Pass --allow-empty if that is expected.");
    }
  } else {
    // report and commit share this branch: the same work, with the UPDATE
    // skipped. A dry run that takes a different code path proves nothing about
    // the real one.
    let sealedCount = 0;
    for (const r of needsSealing) {
      const next: Record<string, string | null> = {};
      for (const c of COLUMNS) {
        const plain = r[c.plain];
        if (plain == null || r[c.sealed] != null) continue;
        next[c.sealed] = seal(plain, key, aadFor(r.id, c.plain));
      }
      if (Object.keys(next).length === 0) continue;
      if (COMMIT) {
        await client.query(
          `UPDATE payments.details
              SET routing_number_encrypted = COALESCE($2, routing_number_encrypted),
                  account_number_encrypted = COALESCE($3, account_number_encrypted),
                  encryption_key_id = $4,
                  updated_at = now()
            WHERE id = $1`,
          [r.id, next.routing_number_encrypted ?? null, next.account_number_encrypted ?? null, key.id]
        );
      }
      sealedCount += 1;
    }
    console.log(
      COMMIT
        ? `\nsealed and wrote ${sealedCount} row(s) under key '${key.id}'`
        : `\nWOULD seal ${sealedCount} row(s) under key '${key.id}' - nothing was written. Re-run with --commit.`
    );
    if (sealedCount === 0 && !ALLOW_EMPTY) {
      die(
        "\nNOTHING WAS SEALED, and that is being treated as a failure.\n" +
        "\n" +
        "Zero rows carried plaintext with no ciphertext. On dev that is the\n" +
        "expected state - all sixteen payouts are ECHECK or DORADO_ACCOUNT and\n" +
        "hold no bank numbers - but a script that processes nothing looks exactly\n" +
        "like a script that worked, and this codebase has shipped that defect six\n" +
        "times. Pass --allow-empty to say you meant it."
      );
    }
    if (COMMIT && sealedCount > 0) {
      console.log(
        "\nNEXT: run --verify to prove every sealed value decrypts to the exchange\n" +
        "plaintext. The plaintext is NOT cleared by this script; that is a separate\n" +
        "destructive migration against exchange, and it is Jacob's."
      );
    }
  }
} finally {
  client.release();
  await pool.end();
}

process.exit(exitCode);
