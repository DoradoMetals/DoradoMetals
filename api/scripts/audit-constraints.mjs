import "#env";
import pool from "#pool";
import { FEATURES, RENAMES } from "./lib/feature-map.ts";

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

  "exchange.sales_orders.sales_order_status -> orders.orders.status":
    "orders.orders merges both directions and exchange.purchase_orders." +
    "purchase_order_status is NULLABLE, so this would tighten the purchase side " +
    "rather than restore the sales side. Measured: 0 nulls in 62 production " +
    "purchase orders and 48 dev rows, so it COULD be tightened - but repo.mirror " +
    "copies purchase_order_status straight across, and a 23502 there fails the " +
    "whole order transaction. A status drives no logic; an unwritten order is " +
    "unrecoverable.",

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

  "exchange.carrier_services.carrier_id -> shipping.services.carrier_id":
    "nullable on purpose since 110 (D208): the sale delivery services are " +
    "carrier-agnostic - the customer picks the service, the refinery picks " +
    "the carrier, and the shipment records that choice on its own row. Only " +
    "the three business rows are NULL; the carrier catalogue keeps its ids.",

  "exchange.sell_cart_items.quantity -> checkout.items.quantity":
    "checkout.items merges cart_items and sell_cart_items, and exchange." +
    "cart_items.quantity is NULLABLE - only the sell side carried the guard. " +
    "The sync body (req.body.cart) is not validated by any contract, so a client " +
    "sending a null quantity would 23502 on a cart sync that exchange accepts " +
    "today. checkout.* is device-sync, not a ledger; the right fix is a contract " +
    "on the sync body, not a column constraint. Measured: 3/3 production " +
    "cart_items and 26/26 sell_cart_items rows populated.",
};

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
        if (!t) continue;
        checked += 1;
        if (t.not_null) continue;
        lost.push({
          feature,
          key: `${source}.${column} -> ${target}.${targetName}`,
          from: `${source}.${column}`,
          to: `${target}.${targetName}`,
          type: s.type,
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

const CONSTRAINT_FLOOR = Number(process.env.AUDIT_CONSTRAINTS_FLOOR ?? 50);
if (!only && checked < CONSTRAINT_FLOOR) {
  console.error(
    `only ${checked} pair(s) compared, expected at least ${CONSTRAINT_FLOOR} - the ` +
      `feature map or the schema has moved and this is no longer looking at anything`
  );
  process.exit(1);
}

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
      if (u.expression || !u.cols.length || (u.cols.length === 1 && u.cols[0] === "id")) continue;
      const mapped = u.cols.map((c) => renames[c] ?? c);
      if (mapped.includes("-")) continue;

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

      const uncovered = [];
      let coveredSomewhere = false;
      for (const target of targets) {
        const guards = await guardsOn(target);
        const present = mapped.filter((c) => guards.has(c));
        if (present.length !== mapped.length) continue;
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
        if (present.length !== mapped.length) continue;
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
