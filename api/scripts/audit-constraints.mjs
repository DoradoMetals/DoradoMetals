// EVERY NOT NULL IN `exchange` WHOSE COUNTERPART IN THE NEW SCHEMA IS NULLABLE.
//
// WHY THIS EXISTS. A database constraint is sometimes the only thing standing
// between working code and a data-loss bug, and when it is, nobody knows -
// because nothing ever fails.
//
// The one that prompted this: features/users/repo.js updates dorado_funds with
// a CASE that has no ELSE, so an unrecognised mode evaluates to NULL. On a
// customer credit ledger - $66,999.32 across eight customers - that is a wiped
// balance. It has never happened, and the reason is not the code. It is that
// exchange.users.dorado_funds is NOT NULL, so Postgres raises 23502 and writes
// nothing. The service also refuses an unknown mode, but the constraint is the
// backstop underneath it.
//
// Now consider promotion. If the column that replaces it is nullable, that
// backstop is gone the day a *_SOURCE switch moves - and the failure mode is
// not an error, it is a NULL where a balance used to be. Nothing in the suite
// would notice, because the suite runs against a schema that still has the
// constraint.
//
// So this asks one question of every mapped column pair: is the source NOT NULL
// while the target is not? It reads the same FEATURES/RENAMES map audit:precision
// uses, so a rename is followed rather than reported as a loss.
//
// The other direction - target NOT NULL where the source is nullable and holds
// NULLs - is verify:backfill's, and it fails loudly there because the insert
// cannot complete. This one is the silent direction.
//
// Shape comes from dev, where both schemas exist. `--prod` is not offered:
// production has no new schema to compare against.

import "#env";
import pool from "#pool";
import { FEATURES, RENAMES } from "./lib/feature-map.ts";

// ---------------------------------------------------------------------------
// THE ACCEPT MAPS, AND WHY THIS SCRIPT NOW EXITS NON-ZERO WITHOUT THEM.
//
// This audit's own closing line was "each one should be a decision rather than
// an accident", and for several waves there was nowhere to record the decision:
// 27 dropped NOT NULLs, 7 unmatched uniques, 3 unmatched CHECKs and 2 unmatched
// foreign keys, re-read from scratch by whoever looked next, with nothing
// noticing when the list changed. Its two siblings - audit:indexes and
// audit:query-paths - had both an ACCEPTED map and a place in `pnpm check`, and
// those two guard LATENCY. This one guards whether an order can exist without a
// total.
//
// PINNED FROM BOTH SIDES, exactly like audit:indexes. A finding that is not
// named here fails the run; a name here that no longer reports a finding fails
// it too, so a constraint that gets fixed cannot leave a stale excuse behind to
// suppress the next real one that lands on the same key.
//
// THE TEST THAT SEPARATES AN ACCEPT FROM A FIX, and it is not "is the column
// full today":
//
//   ACCEPT when the target CANNOT hold the guard. Almost every entry below is
//   one merged table taking the intersection of two parents' guarantees - the
//   nulls belong to the parent that never had the column, and asserting NOT
//   NULL would refuse a row that is correct. D63 measured this the wrong way
//   round once and nearly reported 14 missing order totals: every one of them
//   was a purchase order, and exchange.purchase_orders has no order_total
//   column at all.
//
//   FIX when the target simply lost a guard the source had, and every write
//   path already supplies the value. Those are migrations 101-103, not entries
//   here.
//
// Each entry states the measurement, because "it looks structural" is what the
// D63 aggregate looked like too.
// ---------------------------------------------------------------------------

// The merged sales/purchase order transaction row. exchange.purchase_orders has
// NONE of these columns - verified by column list, not inferred - so every one
// of them is NULL for the 48 purchase-order rows in dev and the 62 in
// production, and NOT NULL cannot be asserted for a table that serves both
// directions. This is D63's finding, written down.
const MERGED_ORDER_MONEY =
  "orders.transactions merges purchase and sales orders. exchange.purchase_orders " +
  "has no order_total / item_total / base_total / sales_tax / shipping_cost / " +
  "charges / used_funds columns AT ALL, so the merged column is null for every " +
  "purchase-order row by construction. Structurally necessary, not accidental " +
  "(D63: 15/15 sales rows populated, every null on the purchase side).";

const ACCEPTED_NOT_NULL = {
  "exchange.sales_orders.order_total -> orders.transactions.total": MERGED_ORDER_MONEY,
  "exchange.sales_orders.item_total -> orders.transactions.items": MERGED_ORDER_MONEY,
  "exchange.sales_orders.base_total -> orders.transactions.base_total": MERGED_ORDER_MONEY,
  "exchange.sales_orders.sales_tax -> orders.transactions.sales_tax": MERGED_ORDER_MONEY,
  "exchange.sales_orders.shipping_cost -> orders.transactions.shipping": MERGED_ORDER_MONEY,
  "exchange.sales_orders.charges_amount -> orders.transactions.surcharge": MERGED_ORDER_MONEY,
  "exchange.sales_orders.pre_charges_amount -> orders.transactions.funds": MERGED_ORDER_MONEY,
  "exchange.sales_orders.post_charges_amount -> orders.transactions.post_charges_amount":
    MERGED_ORDER_MONEY,
  "exchange.sales_orders.subject_to_charges_amount -> orders.transactions.subject_to_charges_amount":
    MERGED_ORDER_MONEY,
  "exchange.sales_orders.used_funds -> orders.transactions.used_funds": MERGED_ORDER_MONEY,

  // The same merge, one step weaker: the other parent HAS the column and it is
  // nullable there, so NOT NULL would be stronger than either parent rather
  // than a restoration. Left as a measurement rather than a constraint because
  // the price of being wrong is a REFUSED ORDER WRITE, and a status is a pure
  // customer-facing label driving no logic (Jacob's standing ruling).
  "exchange.sales_orders.sales_order_status -> orders.orders.status":
    "orders.orders merges both directions and exchange.purchase_orders." +
    "purchase_order_status is NULLABLE, so this would tighten the purchase side " +
    "rather than restore the sales side. Measured: 0 nulls in 62 production " +
    "purchase orders and 48 dev rows, so it COULD be tightened - but repo.mirror " +
    "copies purchase_order_status straight across, and a 23502 there fails the " +
    "whole order transaction. A status drives no logic; an unwritten order is " +
    "unrecoverable.",

  // payments.details is two things in one table: a customer's payout bank
  // account (from exchange.payouts) and the instrument Stripe says was used
  // (from exchange.payment_intents). Neither half has the other's columns.
  "exchange.payouts.method -> payments.details.method_id":
    "payments.details merges payout ACCOUNTS with Stripe INSTRUMENTS. The " +
    "instrument half resolves method_id through a LEFT JOIN on payments.methods " +
    "(repo.next.ts updateMethod), which yields NULL for a Stripe method type " +
    "with no matching row - and that path is the Stripe webhook. exchange." +
    "payment_intents.method_type, the other parent, is nullable.",
  "exchange.payouts.account_holder_name -> payments.details.account_holder":
    "Same merge: exchange.payment_intents has no account-holder column at all, " +
    "so an instrument row has nothing to put there. Measured on dev: 6 of 22 " +
    "payments.details rows are null and all six are intent-derived.",
  "exchange.payment_intents.payment_intent_id -> payments.details.provider_ref":
    "The mirror image of the two above: a PAYOUT account has no provider " +
    "reference, because it never came from Stripe. Measured on dev: 16 of 22 " +
    "null, all sixteen payout-derived. The Stripe half of this guard is " +
    "restored on payments.attempts.provider_ref (migration 102) and on the " +
    "unique index there (103), which is the table that actually holds one row " +
    "per Stripe intent.",

  // 110 made carrier_id nullable ON PURPOSE (D208): the business's own sale
  // delivery services are CARRIER-AGNOSTIC - the customer picks the service
  // at its fixed price and THE REFINERY picks the carrier later, recorded on
  // the shipment. The carrier-catalogue rows keep their carrier_id; only the
  // three agnostic rows carry NULL, and get_sale_options selects exactly
  // those. Exchange's guard described a world where every service belonged
  // to a carrier, and that world ended with the tiers correction.
  "exchange.carrier_services.carrier_id -> shipping.services.carrier_id":
    "nullable on purpose since 110 (D208): the sale delivery services are " +
    "carrier-agnostic - the customer picks the service, the refinery picks " +
    "the carrier, and the shipment records that choice on its own row. Only " +
    "the three business rows are NULL; the carrier catalogue keeps its ids.",

  // checkout is device-sync, not a ledger (CLAUDE.md). The merged parents
  // disagree and the request body is unvalidated.
  "exchange.sell_cart_items.quantity -> checkout.items.quantity":
    "checkout.items merges cart_items and sell_cart_items, and exchange." +
    "cart_items.quantity is NULLABLE - only the sell side carried the guard. " +
    "The sync body (req.body.cart) is not validated by any contract, so a client " +
    "sending a null quantity would 23502 on a cart sync that exchange accepts " +
    "today. checkout.* is device-sync, not a ledger; the right fix is a contract " +
    "on the sync body, not a column constraint. Measured: 3/3 production " +
    "cart_items and 26/26 sell_cart_items rows populated.",
};

// Keyed by the SOURCE INDEX NAME, like audit:indexes' map, because two source
// tables can carry the same column list and a "table(cols)" key collides.
const ACCEPTED_UNIQUE = {
  unique_user_cart:
    "exchange keeps a buy cart and a sell cart in two tables, each unique on " +
    "user_id; checkout.checkouts is one table unique on (user_id, direction). " +
    "The wider index is the CORRECT translation and the narrower one would be " +
    "wrong: 17 production users hold both a cart and a sell_cart, and a unique " +
    "on user_id alone would refuse every one of them.",
  unique_sell_user_cart:
    "The other half of the same merge - see unique_user_cart. 17 production " +
    "users hold both.",
  purchase_orders_order_number_key:
    "orders.orders merged purchase and sales orders and is unique on " +
    "(direction, number). The two sequences ARE independent - exchange." +
    "purchase_orders_order_number_seq is at 13919 and sales_orders_order_number_seq " +
    "at 950, separate objects - so the same number can legitimately exist once " +
    "in each direction and a unique on number alone would be WRONG, not merely " +
    "narrower. Every caller supplies the direction.",
  rates_unique_band:
    "The target's index is STRICTLY STRONGER, not missing. exchange's " +
    "UNIQUE (metal_id, unit, min_qty, max_qty) treats a NULL max_qty as " +
    "distinct, so it permits two identical open-ended bands; rates.rates' " +
    "migration_rates_band_uniq keys on COALESCE(max_qty, -1) and refuses them. " +
    "Proved by experiment in a rolled-back transaction: the exchange-shaped " +
    "index accepted two identical (metal, unit, 0, NULL) rows and the target- " +
    "shaped one raised 23505 on the same pair. Dev and production both hold 4 " +
    "open-ended bands.",
};

const ACCEPTED_CHECK = {};

const ACCEPTED_FK = {
  payment_intents_session_id_fkey:
    "exchange.payment_intents.session_id references exchange.session; the new " +
    "schema's session table is auth.sessions, and THAT MIRROR IS PARTIAL IN " +
    "BOTH DIRECTIONS - measured on dev: 58 exchange.session rows have no " +
    "auth.sessions counterpart and 2 auth.sessions rows have no exchange one. " +
    "An FK here would refuse a payment intent created under an unmirrored " +
    "session, which is a customer failing to check out. The FK becomes correct " +
    "when the auth cutover makes auth.sessions the real table; it is not one " +
    "yet.",
};

const describe = async (table) => {
  const [schema, name] = table.split(".");
  const { rows } = await pool.query(
    `SELECT a.attname AS column, a.attnotnull AS not_null,
            format_type(a.atttypid, a.atttypmod) AS type,
            pg_get_expr(d.adbin, d.adrelid) AS default_expr
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped`,
    [schema, name]
  );
  return new Map(rows.map((r) => [r.column, r]));
};

const only = process.argv.slice(2).find((a) => !a.startsWith("--"));
const features = only ? { [only]: FEATURES[only] } : FEATURES;
if (only && !FEATURES[only]) {
  console.error(`unknown feature: ${only}\nknown: ${Object.keys(FEATURES).join(", ")}`);
  process.exit(1);
}

const shapes = new Map();
const shapeOf = async (table) => {
  if (!shapes.has(table)) shapes.set(table, await describe(table));
  return shapes.get(table);
};

let checked = 0;
let sourceNotNull = 0;
const lost = [];

for (const [feature, sources] of Object.entries(features)) {
  for (const [source, targets] of Object.entries(sources)) {
    const src = await shapeOf(source);
    if (!src.size) continue;
    const renames = RENAMES[source] ?? {};

    for (const [column, s] of src) {
      const targetName = renames[column] ?? column;
      if (targetName === "-") continue;
      if (!s.not_null) continue;
      sourceNotNull += 1;

      for (const target of targets) {
        const dst = await shapeOf(target);
        const t = dst.get(targetName);
        if (!t) continue; // absent is audit:coverage's business, not this one's
        checked += 1;
        if (t.not_null) continue;
        lost.push({
          feature,
          key: `${source}.${column} -> ${target}.${targetName}`,
          from: `${source}.${column}`,
          to: `${target}.${targetName}`,
          type: s.type,
          // A default does not restore the guard - it only fills an INSERT that
          // omits the column. An explicit NULL still lands.
          target_default: t.default_expr ?? null,
        });
      }
    }
  }
}


console.log(
  `${sourceNotNull} NOT NULL column(s) in the source schema, ` +
    `${checked} with a counterpart in the new schema`
);

// A check that finds nothing accepts everything - but ONLY on a full run. The
// first version applied this floor unconditionally, so `audit:constraints leads`
// compared its 8 pairs correctly and then exited 1 for having found only 8.
// That run is also what proved the floor fires.
// NAMED, so the meta-guard can see it. It was the literal `50`, which is a
// floor in every sense except the one that lets `lint:script-guards` verify
// that this file's excuse ("carries a floor") is true rather than claimed.
const CONSTRAINT_FLOOR = Number(process.env.AUDIT_CONSTRAINTS_FLOOR ?? 50);
if (!only && checked < CONSTRAINT_FLOOR) {
  console.error(
    `only ${checked} pair(s) compared, expected at least ${CONSTRAINT_FLOOR} - the ` +
      `feature map or the schema has moved and this is no longer looking at anything`
  );
  process.exit(1);
}


// Every finding is either NAMED in ACCEPTED_NOT_NULL with its reasoning, or it
// is a gap that fails the run. `stale` is the other side of the pin: an entry
// that no longer reports is an excuse without a subject.
const notNullAccepted = lost.filter((l) => ACCEPTED_NOT_NULL[l.key]);
const notNullOpen = lost.filter((l) => !ACCEPTED_NOT_NULL[l.key]);
const staleNotNull = Object.keys(ACCEPTED_NOT_NULL).filter(
  (k) => !lost.some((l) => l.key === k)
);

if (!lost.length) {
  console.log("every one of them is NOT NULL on the other side too");
} else {
  console.log(
    `\n${lost.length} constraint(s) promotion would drop - ` +
      `${notNullAccepted.length} accepted by name, ${notNullOpen.length} open`
  );
}

if (notNullAccepted.length) {
  console.log(`\naccepted - the target cannot hold the guard, with the measurement:\n`);
  for (const i of notNullAccepted) {
    console.log(`  ok ${i.feature}: ${i.from} -> ${i.to}`);
    console.log(`       ${ACCEPTED_NOT_NULL[i.key]}`);
  }
}

if (notNullOpen.length) {
  console.log(`\n${notNullOpen.length} NOT NULL(s) with no decision recorded:\n`);
  const byFeature = {};
  for (const l of notNullOpen) (byFeature[l.feature] ??= []).push(l);
  for (const [feature, items] of Object.entries(byFeature)) {
    console.log(`  ${feature}`);
    for (const i of items) {
      console.log(`    ${i.from}  (${i.type}, NOT NULL)`);
      console.log(`      -> ${i.to} is NULLABLE${i.target_default ? ` default ${i.target_default}` : ""}`);
    }
    console.log("");
  }
  console.log(
    "Each is a guard that exists today and would not after the switch moves.\n" +
      "That is not automatically wrong - some columns are deliberately optional in\n" +
      "the new model - but each one should be a decision rather than an accident.\n" +
      "Restore it in a migration, or name it in ACCEPTED_NOT_NULL with the reason."
  );
}

// ---------------------------------------------------------------------------
// UNIQUENESS, which is the other kind of guard a promotion can drop.
//
// READ FROM pg_index, NOT pg_constraint. A bare `CREATE UNIQUE INDEX` is not a
// constraint row, and exchange has plenty. My first two attempts at this
// queried pg_constraint and both reported ZERO single-column uniques outside
// primary keys - which is absurd for a schema with a users table, and it took
// counting the indexes directly to notice. Two wrong answers that agreed with
// each other.
//
// Reported rather than judged. A source unique on (number) whose target is
// unique on (direction, number) is WEAKER in the strict sense - the composite
// does not enforce uniqueness of number alone - but for a table that merged
// purchase and sales orders it is the correct meaning. So this prints what each
// side has and leaves the reading to whoever is promoting that feature.
// The ::text[] cast below matters. array_agg of a `name` column yields a
// name[], for which node-postgres has no array parser - it arrives as the raw
// string "{a,b}" and every array method on it throws. (Written here rather
// than in the SQL because a backtick inside a template literal ends it, which
// is how the first attempt at this comment broke the file.)
//
// THE INDEX NAME IS SELECTED, not just the column list, because the ACCEPTED
// map is keyed on it - the same way audit:indexes keys its own. Two source
// tables can carry the same column list, and "table(cols)" collides where a
// name does not.
const uniquesOf = async (table) => {
  const [schema, name] = table.split(".");
  const { rows } = await pool.query(
    `SELECT ic.relname AS name,
            bool_or(k.attnum = 0) AS has_expression,
            array_agg(a.attname::text ORDER BY k.ord) AS cols
       FROM pg_index i
       JOIN pg_class c ON c.oid = i.indrelid
       JOIN pg_class ic ON ic.oid = i.indexrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN LATERAL unnest(i.indkey::int[]) WITH ORDINALITY k(attnum, ord)
       LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
      WHERE n.nspname = $1 AND c.relname = $2 AND i.indisunique
      GROUP BY i.indexrelid, ic.relname`,
    [schema, name]
  );
  return rows.map((r) => ({
    name: r.name,
    cols: (r.cols ?? []).filter(Boolean),
    expression: r.has_expression,
  }));
};

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

let uniqueChecked = 0;
let uniqueUnreadable = 0;
const uniqueLost = [];
const uniqueUnmappable = [];

for (const [feature, sources] of Object.entries(features)) {
  for (const [source, targets] of Object.entries(sources)) {
    const renames = RENAMES[source] ?? {};
    for (const u of await uniquesOf(source)) {
      // A surrogate primary key is not the guard anybody relies on.
      if (u.expression || !u.cols.length || (u.cols.length === 1 && u.cols[0] === "id")) continue;
      const mapped = u.cols.map((c) => renames[c] ?? c);
      if (mapped.includes("-")) continue;

      // WHICH TARGETS COULD EVEN HOLD THIS INDEX. Only one that has every
      // mapped column - the same filter audit:indexes has always applied, and
      // its absence here produced a finding that was simply not true:
      // exchange.purchase_orders(order_number) was reported as unmatched
      // against refiners.orders, which has no `number` column at all. A target
      // that does not carry the column cannot be missing an index on it.
      // Reported as `?` when NO target carries them, never as present - a scan
      // that cannot see something must not call it clean.
      const candidates = [];
      for (const target of targets) {
        const cols = await shapeOf(target);
        if (mapped.every((c) => cols.has(c))) candidates.push(target);
      }
      if (candidates.length === 0) {
        uniqueUnreadable += 1;
        uniqueUnmappable.push({
          feature, index: u.name,
          from: `${source}(${u.cols.join(", ")})`,
          why: `no target among ${targets.join(", ")} holds all of (${mapped.join(", ")})`,
        });
        continue;
      }
      uniqueChecked += 1;

      const alternatives = [];
      let matched = false;
      for (const target of candidates) {
        for (const t of await uniquesOf(target)) {
          if (t.expression) { alternatives.push(`${target}(${t.cols.join(", ")} + expression)`); continue; }
          if (sameSet(mapped, t.cols)) { matched = true; break; }
          if (mapped.every((c) => t.cols.includes(c))) alternatives.push(`${target}(${t.cols.join(", ")})`);
        }
        if (matched) break;
      }
      if (!matched) {
        uniqueLost.push({
          feature,
          index: u.name,
          from: `${source}(${u.cols.join(", ")})`,
          to: mapped.join(", "),
          targets: candidates.join(", "),
          alternatives,
        });
      }
    }
  }
}

const uniqueAccepted = uniqueLost.filter((u) => ACCEPTED_UNIQUE[u.index]);
const uniqueOpen = uniqueLost.filter((u) => !ACCEPTED_UNIQUE[u.index]);
const staleUnique = Object.keys(ACCEPTED_UNIQUE).filter(
  (k) => !uniqueLost.some((u) => u.index === k)
);

console.log(`\n${uniqueChecked} unique index(es) in the source schema, excluding primary keys and expressions`);
if (uniqueUnmappable.length) {
  console.log(`${uniqueUnmappable.length} could not be checked - reported as ?, never as present:`);
  for (const u of uniqueUnmappable) console.log(`  ?  ${u.feature}: ${u.from} - ${u.why}`);
}
if (!uniqueLost.length) {
  console.log("every one has an exact counterpart in the new schema");
} else {
  console.log(
    `${uniqueLost.length} without an exact counterpart - ` +
      `${uniqueAccepted.length} accepted by name, ${uniqueOpen.length} open`
  );
}

if (uniqueAccepted.length) {
  console.log(`\naccepted - each checked against what the merged table has to mean:\n`);
  for (const u of uniqueAccepted) {
    console.log(`  ok ${u.feature}: ${u.from}  [${u.index}]`);
    console.log(`       ${ACCEPTED_UNIQUE[u.index]}`);
  }
  console.log("");
}

if (uniqueOpen.length) {
  console.log(`\n${uniqueOpen.length} with no decision recorded:\n`);
  for (const u of uniqueOpen) {
    console.log(`  ${u.feature}`);
    console.log(`    ${u.from}  [${u.index}]`);
    console.log(`      -> nothing in ${u.targets} is unique on (${u.to})`);
    if (u.alternatives.length) {
      console.log(`      the target does have: ${[...new Set(u.alternatives)].join("; ")}`);
      console.log(`      WIDER is not the same as equal - a unique on (a, b) does not make a unique`);
    }
    console.log("");
  }
}

// ---------------------------------------------------------------------------
// CHECK CONSTRAINTS, and the three ways one can legitimately disappear.
//
// A CHECK is not always replaced by a CHECK. exchange guards a metal type with
// `type = ANY (ARRAY['Gold', ...])`; the new schema makes it a uuid referencing
// metals.metals, which is STRONGER. Same for payouts.method, which becomes a
// foreign key into payments.methods. A naive comparison would report both as
// losses and be wrong twice.
//
// So a source CHECK is only reported when the column it protects has NONE of:
//   - a CHECK of its own
//   - an enum type (which encodes the allowlist in the type system)
//   - a foreign key (which moves the allowlist into a table)
//
// That is a sound test of "nothing replaces this" rather than a guess.
const guardsOn = async (table) => {
  const [schema, name] = table.split(".");
  const { rows } = await pool.query(
    `SELECT a.attname::text AS column,
            t.typtype = 'e' AS is_enum,
            EXISTS (SELECT 1 FROM pg_constraint k
                     WHERE k.conrelid = c.oid AND k.contype = 'c'
                       AND a.attnum = ANY(k.conkey)) AS has_check,
            EXISTS (SELECT 1 FROM pg_constraint k
                     WHERE k.conrelid = c.oid AND k.contype = 'f'
                       AND a.attnum = ANY(k.conkey)) AS has_fkey
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_type t ON t.oid = a.atttypid
      WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped`,
    [schema, name]
  );
  return new Map(rows.map((r) => [r.column, r]));
};

const checksOn = async (table) => {
  const [schema, name] = table.split(".");
  const { rows } = await pool.query(
    `SELECT con.conname::text AS name,
            pg_get_constraintdef(con.oid) AS def,
            array_agg(a.attname::text) AS cols
       FROM pg_constraint con
       JOIN pg_class c ON c.oid = con.conrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(con.conkey)
      WHERE n.nspname = $1 AND c.relname = $2 AND con.contype = 'c'
      GROUP BY con.oid, con.conname`,
    [schema, name]
  );
  return rows;
};

let checksChecked = 0;
const checksLost = [];

for (const [feature, sources] of Object.entries(features)) {
  for (const [source, targets] of Object.entries(sources)) {
    const renames = RENAMES[source] ?? {};
    for (const chk of await checksOn(source)) {
      const mapped = (chk.cols ?? []).map((c) => renames[c] ?? c);
      if (!mapped.length || mapped.includes("-")) continue;
      checksChecked += 1;

      // ONE VERDICT PER CHECK, NOT ONE PER TARGET. A source table often maps to
      // several, and a column name can mean different things in two of them -
      // exchange.mints(type) is Private/Sovereign, and organizations(type) is
      // REFINER. The first version reported the mints check as lost because
      // organizations.type has no allowlist, while products.mints carries it
      // exactly. If ANY target covers the column, the guard survives.
      const uncovered = [];
      let coveredSomewhere = false;
      for (const target of targets) {
        const guards = await guardsOn(target);
        const present = mapped.filter((c) => guards.has(c));
        if (present.length !== mapped.length) continue; // target lacks the column
        const covered = present.every((c) => {
          const g = guards.get(c);
          return g.has_check || g.is_enum || g.has_fkey;
        });
        if (covered) { coveredSomewhere = true; break; }
        uncovered.push(`${target}(${mapped.join(", ")})`);
      }
      if (!coveredSomewhere && uncovered.length) {
        checksLost.push({
          feature,
          name: chk.name,
          from: `${source}(${chk.cols.join(", ")})`,
          def: chk.def,
          to: uncovered.join(", "),
        });
      }
    }
  }
}

const checksAccepted = checksLost.filter((c) => ACCEPTED_CHECK[c.name]);
const checksOpen = checksLost.filter((c) => !ACCEPTED_CHECK[c.name]);
const staleCheck = Object.keys(ACCEPTED_CHECK).filter(
  (k) => !checksLost.some((c) => c.name === k)
);

console.log(`\n${checksChecked} CHECK constraint(s) in the source schema`);
if (!checksLost.length) {
  console.log("every one is matched by a check, an enum or a foreign key on the other side");
} else {
  console.log(
    `${checksLost.length} whose column has no check, no enum and no foreign key - ` +
      `${checksAccepted.length} accepted by name, ${checksOpen.length} open`
  );
}

if (checksAccepted.length) {
  console.log(`\naccepted:\n`);
  for (const c of checksAccepted) {
    console.log(`  ok ${c.feature}: ${c.from}  [${c.name}]`);
    console.log(`       ${ACCEPTED_CHECK[c.name]}`);
  }
}

if (checksOpen.length) {
  console.log(`\n${checksOpen.length} with no decision recorded:\n`);
  for (const c of checksOpen) {
    console.log(`  ${c.feature}`);
    console.log(`    ${c.from}  [${c.name}]`);
    console.log(`      ${c.def}`);
    console.log(`      -> ${c.to} has nothing standing in for it\n`);
  }
}

// ---------------------------------------------------------------------------
// FOREIGN KEYS, and why this section is narrower than it looks like it should be.
//
// A naive comparison - "the source has an FK on these columns, does the target"
// - reports FOUR losses here, and TWO of them are wrong. A relationship
// legitimately MOVES TABLE:
//
//   exchange.addresses(user_id)      -> places.user_addresses(user_id), which
//                                       is a join table and keeps the FK
//   exchange.carrier_pickups(user_id)-> reachable through
//                                       fulfillments.pickups(fulfillment_id)
//                                       -> fulfillment -> order -> user
//
// Both of those targets do not have a user_id column AT ALL, which is the tell.
// So this only judges a target that HAS the mapped column and has no foreign
// key on it - the case where the column was carried over and the guard was not.
// Checked by hand against all four before narrowing it, rather than tuning the
// rule until the output looked nice.
const fkColumnsOf = async (table) => {
  const [schema, name] = table.split(".");
  const { rows } = await pool.query(
    `SELECT a.attname::text AS column,
            EXISTS (SELECT 1 FROM pg_constraint k
                     WHERE k.conrelid = c.oid AND k.contype = 'f'
                       AND a.attnum = ANY(k.conkey)) AS has_fkey
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped`,
    [schema, name]
  );
  return new Map(rows.map((r) => [r.column, r.has_fkey]));
};

const sourceFks = async (table) => {
  const [schema, name] = table.split(".");
  const { rows } = await pool.query(
    `SELECT con.conname::text AS name,
            array_agg(a.attname::text ORDER BY k.ord) AS cols
       FROM pg_constraint con
       JOIN pg_class c ON c.oid = con.conrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN LATERAL unnest(con.conkey::int[]) WITH ORDINALITY k(attnum, ord)
       JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
      WHERE n.nspname = $1 AND c.relname = $2 AND con.contype = 'f'
      GROUP BY con.oid, con.conname`,
    [schema, name]
  );
  return rows
    .map((r) => ({ name: r.name, cols: r.cols ?? [] }))
    .filter((f) => f.cols.length);
};

let fkChecked = 0;
const fkLost = [];

for (const [feature, sources] of Object.entries(features)) {
  for (const [source, targets] of Object.entries(sources)) {
    const renames = RENAMES[source] ?? {};
    for (const { name: fkName, cols } of await sourceFks(source)) {
      const mapped = cols.map((c) => renames[c] ?? c);
      if (mapped.includes("-")) continue;

      const carriedButUnguarded = [];
      let covered = false;
      for (const target of targets) {
        const fks = await fkColumnsOf(target);
        const present = mapped.filter((c) => fks.has(c));
        if (present.length !== mapped.length) continue; // moved table; not this check's business
        fkChecked += 1;
        if (mapped.every((c) => fks.get(c))) { covered = true; break; }
        carriedButUnguarded.push(`${target}(${mapped.join(", ")})`);
      }
      if (!covered && carriedButUnguarded.length) {
        fkLost.push({
          feature, name: fkName,
          from: `${source}(${cols.join(", ")})`,
          to: carriedButUnguarded.join(", "),
        });
      }
    }
  }
}

const fkAccepted = fkLost.filter((f) => ACCEPTED_FK[f.name]);
const fkOpen = fkLost.filter((f) => !ACCEPTED_FK[f.name]);
const staleFk = Object.keys(ACCEPTED_FK).filter(
  (k) => !fkLost.some((f) => f.name === k)
);

console.log(`\n${fkChecked} foreign key(s) whose columns were carried over to a target`);
if (!fkLost.length) {
  console.log("every one of them is a foreign key on the other side too");
} else {
  console.log(
    `${fkLost.length} carried over WITHOUT the foreign key - ` +
      `${fkAccepted.length} accepted by name, ${fkOpen.length} open`
  );
}

if (fkAccepted.length) {
  console.log(`\naccepted - each one points at a table that is not yet complete:\n`);
  for (const f of fkAccepted) {
    console.log(`  ok ${f.feature}: ${f.from}  [${f.name}]`);
    console.log(`       ${ACCEPTED_FK[f.name]}`);
  }
}

if (fkOpen.length) {
  console.log(`\n${fkOpen.length} with no decision recorded:\n`);
  for (const f of fkOpen) {
    console.log(`  ${f.feature}`);
    console.log(`    ${f.from}  [${f.name}]`);
    console.log(`      -> ${f.to} has the column but no foreign key on it\n`);
  }
}

await pool.end();

// ---------------------------------------------------------------------------
// THE VERDICT, and the second half of the pin.
//
// An unaccepted finding fails. So does an ACCEPTED entry that no longer reports
// one: audit:indexes learned this the hard way with `unique_payment_intent_id`,
// an entry whose reasoning was wrong and which sat there suppressing a real gap
// on the Stripe webhook path until migration 082 removed both. An allowlist that
// can only be added to is a way of forgetting.
//
// `--only <feature>` narrows the walk, so the stale half is suppressed there:
// an entry for another feature has not gone stale, it simply was not looked at.
const stale = only
  ? []
  : [
      ...staleNotNull.map((k) => `ACCEPTED_NOT_NULL  ${k}`),
      ...staleUnique.map((k) => `ACCEPTED_UNIQUE    ${k}`),
      ...staleCheck.map((k) => `ACCEPTED_CHECK     ${k}`),
      ...staleFk.map((k) => `ACCEPTED_FK        ${k}`),
    ];

if (stale.length) {
  console.log(`\n${stale.length} ACCEPTED entr(ies) no longer report a finding - remove them:`);
  for (const s of stale) console.log(`  STALE  ${s}`);
}

const open = notNullOpen.length + uniqueOpen.length + checksOpen.length + fkOpen.length;
console.log(
  `\n${open} guard(s) with no decision recorded, ` +
    `${notNullAccepted.length + uniqueAccepted.length + checksAccepted.length + fkAccepted.length} accepted, ` +
    `${stale.length} stale accept(s), ` +
    `${uniqueUnreadable} unreadable`
);
if (open === 0 && stale.length === 0) {
  console.log("every guard exchange holds is either held by the schema that replaces it, or accepted by name");
}
process.exit(open || stale.length ? 1 : 0);
