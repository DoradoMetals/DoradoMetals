// EVERY DOMAIN STAYS IN ITS OWN LANE. Rulings 69 and 70 (Jacob, 2026-09-04):
// *"Checkout/Orders shouldn't care about what's going on over in fulfillment
// world."* *"Everything needs to stay in its own lane. The only thing that
// should be deciding if fulfillments is 'ready' is fulfillments."*
//
// *** THE SHAPE. *** `domain/checkout` reading
//
//     if (!row.shipper_address_id) missing.push("shipper_address");
//     if (!row.package_id) missing.push("package");
//
// is checkout deciding whether a FULFILLMENT is complete. It was possible only
// because those columns sat on `checkout.checkouts`; migration 128 moved them
// to the detail row of the draft fulfillment, and this scan is what keeps them
// from coming back. `fulfillments.missing(fulfillment_id)` is the one call
// checkout makes, and its answer is an opaque list checkout splices and never
// inspects.
//
// *** HOW IT KNOWS WHAT A COLUMN IS. *** From @dorado/contracts, which
// generates one zod schema per table from information_schema, grouped by the
// SCHEMA the table lives in (`packages/contracts/src/<schema>/*.ts` carries a
// `// Postgres table: <schema>.<table>` header). So the map is derived, never
// hand-listed - a column added by a migration is guarded the moment the
// contracts are regenerated.
//
// *** THREE KINDS OF NAME ARE DROPPED, AND THAT IS THE WHOLE ACCURACY STORY. ***
// Each is excluded by CONSTRUCTION rather than by an ACCEPTED entry, because an
// ACCEPTED entry claims a finding is safe and none of these is a finding at all.
//
//   1. AMBIGUOUS. A column owned by two schemas identifies nothing:
//      `recipient_address_id` is a column of `checkout.checkouts` AND of
//      `shipping.shipments`, so seeing it in `domain/orders` says nothing about
//      which is meant. So are `fulfillment_id`, `shipment_id`, `order_id`,
//      `user_id` and every audit column.
//
//   2. SINGLE WORDS. `length`, `code`, `name`, `type`, `category`, `amount` and
//      `status` are all real columns and all ordinary English; `.length` alone
//      appears in every file that counts anything. A column name that carries
//      no underscore is a WORD, and a word cannot identify a lane crossing.
//
//   3. THE OTHER DOMAIN'S OWN ROW ID - `<schema singular>_id`, so `checkout_id`
//      for `checkout` and `payment_id` for `payments`. Holding the other
//      resource's id and handing it over IS the boundary (ruling 43: "the
//      client sends ids for what the server holds"); `fulfillments.missing(
//      fulfillment_id)` and `createForCheckout({ checkout_id })` are the shape
//      this lint exists to protect, not to refuse.
//
// *** WHAT IT DOES NOT CLAIM. *** A text scan, not a type checker. It sees an
// identifier or a string literal, not what it was read off - so a local
// variable that happens to be called `package_id` is a finding, and that is
// deliberate: naming another domain's column is the smell, whatever holds it.
//
//   node scripts/lint-domain-boundaries.ts
//   node scripts/lint-domain-boundaries.ts --self-test
//
// Exits non-zero on any unaccepted finding, on an ACCEPTED count that has moved
// in EITHER direction, and on an ACCEPTED entry naming a file that is clean or
// gone - pinned from both sides like lint-no-column-arrays' ACCEPTED.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.env.LINT_DOMAIN_BOUNDARIES_ROOT
  ? path.resolve(process.env.LINT_DOMAIN_BOUNDARIES_ROOT)
  : path.join(import.meta.dirname, "..");

const CONTRACTS = existsSync(path.join(ROOT, "contracts"))
  ? path.join(ROOT, "contracts")
  : path.join(ROOT, "..", "packages", "contracts", "src");

// THE LANES, AND EACH ONE'S REASON.
//
// The pairs are asymmetric on purpose. Checkout and orders must not name a
// fulfillment's, a parcel's or a payment row's columns - they hold ids and ask
// the owner. Fulfillments must not name a checkout's, because the draft belongs
// to a checkout and the temptation runs that way: it would be one line to read
// `payment_details_id` off the row it is attached to and decide the whole
// checkout is ready, which is ruling 70 backwards.
// `payments` IS DELIBERATELY NOT IN EITHER LANE, and this is the one judgement
// call in the file. Checkout OWNS `payment_method_id` and `payment_details_id`
// as columns of its own row, and `CheckoutPayoutForm` is a `PaymentDetails`
// pick by design (D210) - so the payments boundary is already expressed as a
// contract derivation rather than as a rule about names, and adding it here
// would report the design as a defect. Orders' payment-intent handling is
// D179's subject, not rulings 69/70's.
const LANES: { dir: string; forbidden: string[]; why: string }[] = [
  {
    dir: "domain/checkout",
    forbidden: ["fulfillments", "shipping"],
    why: "checkout holds a fulfillment_id and asks fulfillments.missing (ruling 70)",
  },
  {
    dir: "domain/orders",
    forbidden: ["fulfillments", "shipping"],
    why: "an order attaches a fulfillment and asks shipping for a label (rulings 67/69)",
  },
  {
    dir: "domain/fulfillments",
    forbidden: ["checkout"],
    why: "a draft belongs to a checkout; the checkout's own columns are its own",
  },
];

// EVERY ENTRY CARRIES A REASON AND A COUNT, and both sides are pinned: a new
// name in an accepted file fails, and removing one fails until the count comes
// down in the same diff.
//
// BOTH ENTRIES ARE THE ADMIN ORDER SURFACE, AND NEITHER IS THE CUSTOMER PATH
// rulings 69/70 are about. They are recorded rather than fixed because fixing
// them is a different wave's subject - the admin drawers are interim UI
// (FOLLOWUPS D87) and the cancel body is a shape ruling 44 says the frontend
// pass may change.
const ACCEPTED: Record<string, { count: number; why: string }> = {
  "domain/orders/service.ts": {
    count: 10,
    why:
      "the ADMIN cancel and the hand-entered tracking number. `cancel` takes " +
      "OrderCancelBody's carrier_service_id + package_id - an admin choosing the " +
      "RETURN parcel's box and service, which no fulfillment draft describes " +
      "because a return leg is not a handover the customer made; updateTracking " +
      "records a number an admin was given by phone. Both write through " +
      "domain/shipping's own service, so the parcel's columns are still " +
      "shipping's to write - what is named here is the admin's INPUT.",
  },
  "domain/orders/rules.ts": {
    count: 2,
    why:
      "`OrderActions.buy_label` and `update_tracking` are answered from the " +
      "parcel's own state (ruling 67: 'the parcel exists and carries no label, " +
      "so POST /api/shipments/:id/label will accept'). Reading tracking_number " +
      "to decide whether a BUTTON is offered is the admin drawer's question, " +
      "not a customer handover decision.",
  },
};

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e === "node_modules" || e === "dist" || e === "tests" || e === "sql") continue;
    const full = path.join(dir, e);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) walk(full, out);
    else if (e.endsWith(".ts") && !e.endsWith(".d.ts") && !e.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

// Comments say what a rule USED to be and cite the columns that moved; this
// file's own header does it four times. Only code is scanned.
function withoutComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (_m, lead: string) => lead);
}

// ------------------------------------------------------------- the contracts

// schema -> the column names its tables declare. Read from the GENERATED block
// of each entity file, which carries the table's own `<schema>.<table>` name.
const columnsBySchema = new Map<string, Set<string>>();
let tablesRead = 0;

for (const file of walk(CONTRACTS)) {
  const src = readFileSync(file, "utf8");
  const start = src.indexOf("// generated:start");
  const end = src.indexOf("// generated:end");
  if (start === -1 || end === -1) continue;
  const generated = src.slice(start, end);
  const table = /\/\/ Postgres table: ([A-Za-z_][\w]*)\.([A-Za-z_][\w]*)/.exec(generated);
  if (!table) continue;
  const schema = table[1];
  const columns = columnsBySchema.get(schema) ?? new Set<string>();
  for (const m of generated.matchAll(/^\s*"([A-Za-z_][A-Za-z0-9_]*)":/gm)) columns.add(m[1]);
  columnsBySchema.set(schema, columns);
  tablesRead += 1;
}

// A NAME OWNED BY MORE THAN ONE SCHEMA IDENTIFIES NOTHING. Counted across every
// schema the contracts declare, not just the mapped ones - `id`, `created_at`
// and `user_id` are everywhere, and so are the join keys.
const owners = new Map<string, Set<string>>();
for (const [schema, columns] of columnsBySchema) {
  for (const column of columns) {
    const set = owners.get(column) ?? new Set<string>();
    set.add(schema);
    owners.set(column, set);
  }
}
// `checkout` -> `checkout_id`, `payments` -> `payment_id`: the id of a row of
// that schema, which is what a caller HANDS OVER rather than reads.
const rowPointerFor = (schema: string): string =>
  `${schema.endsWith("s") ? schema.slice(0, -1) : schema}_id`;

const guardable = (schema: string, column: string): boolean =>
  owners.get(column)?.size === 1
  && column.includes("_")
  && column !== rowPointerFor(schema);

const unambiguous = (schema: string): Set<string> =>
  new Set([...(columnsBySchema.get(schema) ?? [])].filter((c) => guardable(schema, c)));

const guarded = new Map<string, Set<string>>();
for (const lane of LANES) {
  for (const schema of lane.forbidden) {
    if (!guarded.has(schema)) guarded.set(schema, unambiguous(schema));
  }
}

// ---------------------------------------------------------------- the checks

type Finding = { file: string; line: number; what: string };

const lineOf = (src: string, index: number): number => src.slice(0, index).split("\n").length;

// An identifier or a string literal. `\b` on both sides, so `shipper_address_id`
// matches and `my_shipper_address_id_thing` does not.
function findingsIn(rel: string, raw: string, forbidden: string[], why: string): Finding[] {
  const src = withoutComments(raw);
  const out: Finding[] = [];
  for (const schema of forbidden) {
    for (const column of guarded.get(schema) ?? []) {
      const re = new RegExp(`\\b${column}\\b`, "g");
      for (const m of src.matchAll(re)) {
        out.push({
          file: rel,
          line: lineOf(src, m.index ?? 0),
          what: `names \`${column}\`, a column of the \`${schema}\` schema - ${why}`,
        });
      }
    }
  }
  return out.sort((a, b) => a.line - b.line);
}

// ------------------------------------------------------------------ self-test

if (process.argv.includes("--self-test")) {
  const { selfTest } = await import("./lib/self-test-harness.ts");
  const LOW = { LINT_DOMAIN_BOUNDARIES_FLOOR: "1", LINT_DOMAIN_BOUNDARIES_TABLES: "2" };

  const entity = (schema: string, table: string, columns: string[]) =>
    "// generated:start\n" +
    `// Postgres table: ${schema}.${table}\n` +
    `export const X = z.object({\n` +
    columns.map((c) => `  "${c}": z.string(),\n`).join("") +
    "});\n" +
    "// generated:end\n";

  const checkoutEntity = entity(
    "checkout", "checkouts", ["id", "user_id", "payment_details_id", "checkout_id"]
  );
  const shipmentEntity = entity(
    "shipping", "shipments", ["id", "user_id", "package_id", "carrier_service_id", "length"]
  );
  const clean = "export const missing = async (id) => await fulfillments.missing(id);\n";

  await selfTest({
    script: new URL(import.meta.url).pathname,
    cases: [
      {
        name: "checkout naming a shipping column is seen",
        rootEnv: "LINT_DOMAIN_BOUNDARIES_ROOT", env: LOW,
        files: {
          "contracts/checkout.ts": checkoutEntity,
          "contracts/shipping.ts": shipmentEntity,
          "domain/checkout/rules.ts": "const owed = row.package_id ? [] : ['package'];\n",
        },
        expect: "fail", mustPrint: "domain/checkout/rules.ts",
      },
      {
        name: "the column is named in the message, so the fix is obvious",
        rootEnv: "LINT_DOMAIN_BOUNDARIES_ROOT", env: LOW,
        files: {
          "contracts/checkout.ts": checkoutEntity,
          "contracts/shipping.ts": shipmentEntity,
          "domain/checkout/service.ts": "const x = 'carrier_service_id';\n",
        },
        expect: "fail", mustPrint: "carrier_service_id",
      },
      {
        name: "orders is held to the same rule as checkout",
        rootEnv: "LINT_DOMAIN_BOUNDARIES_ROOT", env: LOW,
        files: {
          "contracts/checkout.ts": checkoutEntity,
          "contracts/shipping.ts": shipmentEntity,
          "domain/orders/place.ts": "const box = checkout.package_id;\n",
        },
        expect: "fail", mustPrint: "domain/orders/place.ts",
      },
      {
        name: "the rule is symmetric: fulfillments may not name a checkout column",
        rootEnv: "LINT_DOMAIN_BOUNDARIES_ROOT", env: LOW,
        files: {
          "contracts/checkout.ts": checkoutEntity,
          "contracts/shipping.ts": shipmentEntity,
          "domain/fulfillments/rules.ts": "const paid = row.payment_details_id != null;\n",
        },
        expect: "fail", mustPrint: "payment_details_id",
      },
      {
        name: "a domain naming its OWN columns is fine",
        rootEnv: "LINT_DOMAIN_BOUNDARIES_ROOT", env: LOW,
        files: {
          "contracts/checkout.ts": checkoutEntity,
          "contracts/shipping.ts": shipmentEntity,
          "domain/checkout/service.ts": "const paid = row.payment_details_id != null;\n",
        },
        expect: "pass", mustPrint: "0 unaccepted",
      },
      {
        name: "the other domain's own row id is the currency of the boundary",
        rootEnv: "LINT_DOMAIN_BOUNDARIES_ROOT", env: LOW,
        files: {
          "contracts/checkout.ts": checkoutEntity,
          "contracts/shipping.ts": shipmentEntity,
          "domain/fulfillments/drafts.ts": "const draft = (checkout_id) => checkout_id;\n",
        },
        expect: "pass", mustPrint: "0 unaccepted",
      },
      {
        name: "a single-word column name is a word, not a lane crossing",
        rootEnv: "LINT_DOMAIN_BOUNDARIES_ROOT", env: LOW,
        files: {
          "contracts/checkout.ts": checkoutEntity,
          "contracts/shipping.ts": shipmentEntity,
          "domain/checkout/service.ts": "const n = rows.length;\n",
        },
        expect: "pass", mustPrint: "0 unaccepted",
      },
      {
        name: "a name owned by two schemas identifies nothing and is not a finding",
        rootEnv: "LINT_DOMAIN_BOUNDARIES_ROOT", env: LOW,
        files: {
          "contracts/checkout.ts": checkoutEntity,
          "contracts/shipping.ts": shipmentEntity,
          "domain/checkout/service.ts": "const who = row.user_id;\n",
        },
        expect: "pass", mustPrint: "0 unaccepted",
      },
      {
        name: "a column named only in a comment is not a finding",
        rootEnv: "LINT_DOMAIN_BOUNDARIES_ROOT", env: LOW,
        files: {
          "contracts/checkout.ts": checkoutEntity,
          "contracts/shipping.ts": shipmentEntity,
          "domain/checkout/service.ts": "// package_id used to live here\n" + clean,
        },
        expect: "pass", mustPrint: "0 unaccepted",
      },
      {
        name: "a longer identifier that merely contains the name is not a finding",
        rootEnv: "LINT_DOMAIN_BOUNDARIES_ROOT", env: LOW,
        files: {
          "contracts/checkout.ts": checkoutEntity,
          "contracts/shipping.ts": shipmentEntity,
          "domain/checkout/service.ts": "const legacy_package_id_note = 1;\n",
        },
        expect: "pass", mustPrint: "0 unaccepted",
      },
      {
        name: "a domain outside the lanes is not scanned",
        rootEnv: "LINT_DOMAIN_BOUNDARIES_ROOT", env: LOW,
        files: {
          "contracts/checkout.ts": checkoutEntity,
          "contracts/shipping.ts": shipmentEntity,
          "domain/checkout/service.ts": clean,
          "domain/quotes/service.ts": "const box = row.package_id;\n",
        },
        expect: "pass", mustPrint: "0 unaccepted",
      },
      {
        name: "a test file is not a finding",
        rootEnv: "LINT_DOMAIN_BOUNDARIES_ROOT", env: LOW,
        files: {
          "contracts/checkout.ts": checkoutEntity,
          "contracts/shipping.ts": shipmentEntity,
          "domain/checkout/service.ts": clean,
          "domain/checkout/tests/x.test.ts": "const box = row.package_id;\n",
        },
        expect: "pass", mustPrint: "0 unaccepted",
      },
      {
        name: "a tree with no contracts to read is broken, not clean",
        rootEnv: "LINT_DOMAIN_BOUNDARIES_ROOT",
        env: { LINT_DOMAIN_BOUNDARIES_FLOOR: "1" },
        files: { "domain/checkout/service.ts": "const box = row.package_id;\n" },
        expect: "fail", mustPrint: "no contract",
      },
      {
        name: "the file floor fires on a tree far below it",
        rootEnv: "LINT_DOMAIN_BOUNDARIES_ROOT",
        env: { LINT_DOMAIN_BOUNDARIES_TABLES: "2" },
        files: {
          "contracts/checkout.ts": checkoutEntity,
          "contracts/shipping.ts": shipmentEntity,
          "domain/checkout/service.ts": clean,
        },
        expect: "fail", mustPrint: "fewer files",
      },
    ],
  });
}

// ----------------------------------------------------------------- the run

const SYNTHETIC = Boolean(process.env.LINT_DOMAIN_BOUNDARIES_ROOT);

// A scan that read no schemas cannot tell a column name from any other word,
// and would call every lane clean.
const TABLES_FLOOR = Number(process.env.LINT_DOMAIN_BOUNDARIES_TABLES ?? 40);
if (tablesRead < TABLES_FLOOR) {
  console.error(
    `lint:domain-boundaries read ${tablesRead} contract table(s) from ${CONTRACTS}, ` +
      `fewer than the ${TABLES_FLOOR} it expects. With no contract schemas to compare ` +
      `against, every lane looks clean - this is a broken read, not a clean tree.`
  );
  process.exit(1);
}

// THE KNOWN-PRESENT CONTROL. The floor above proves schemas were READ; this
// proves the ambiguity filter did not eat the guarded set. Three names that
// are each owned by exactly one of the mapped schemas today.
if (!SYNTHETIC) {
  const control: [string, string][] = [
    ["shipping", "package_id"],
    ["shipping", "carrier_service_id"],
    ["fulfillments", "pickup_address_id"],
  ];
  const lost = control.filter(([schema, column]) => !guarded.get(schema)?.has(column));
  if (lost.length) {
    console.error(
      `lint:domain-boundaries lost its control names: ` +
        lost.map(([s, c]) => `${s}.${c}`).join(", ") +
        `. Either the contracts moved or the ambiguity filter is eating the map.`
    );
    process.exit(1);
  }
}

const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join("/");

let scanned = 0;
const byFile = new Map<string, Finding[]>();
for (const lane of LANES) {
  for (const file of walk(path.join(ROOT, lane.dir))) {
    scanned += 1;
    const found = findingsIn(rel(file), readFileSync(file, "utf8"), lane.forbidden, lane.why);
    if (found.length) byFile.set(rel(file), found);
  }
}

const FLOOR = Number(process.env.LINT_DOMAIN_BOUNDARIES_FLOOR ?? 18);
if (scanned < FLOOR) {
  console.error(
    `lint:domain-boundaries scanned ${scanned} file(s), fewer files than the lanes ` +
      `actually hold (at least ${FLOOR}). The walk broke, not the tree shrank.`
  );
  process.exit(1);
}

const problems: string[] = [];
const acceptedHit = new Set<string>();

for (const [file, found] of [...byFile].sort()) {
  const entry = SYNTHETIC ? undefined : ACCEPTED[file];
  if (!entry) {
    for (const f of found) problems.push(`${f.file}:${f.line}  ${f.what}`);
    continue;
  }
  acceptedHit.add(file);
  if (entry.count !== found.length) {
    problems.push(
      `${file}  ACCEPTED says ${entry.count} finding(s), the file has ${found.length}. ` +
        (found.length < entry.count
          ? `Good - lower the ACCEPTED count to ${found.length} in the same diff.`
          : `A NEW cross-lane column name was added to an accepted file.`)
    );
  }
}

const guardedTotal = [...guarded.values()].reduce((n, s) => n + s.size, 0);
console.log(
  `${scanned} file(s) across ${LANES.length} lane(s) scanned against ` +
    `${guardedTotal} unambiguous column name(s) from ${tablesRead} contract table(s)`
);
for (const p of problems) console.error("  " + p);
console.log(`\n${problems.length} unaccepted finding(s), ${acceptedHit.size} accepted file(s)`);

let total = 0;
for (const [file, entry] of Object.entries(ACCEPTED)) {
  if (acceptedHit.has(file)) {
    total += entry.count;
    console.log(`  accepted  ${file}  ${entry.count} finding(s) - ${entry.why}`);
  }
}
if (acceptedHit.size) console.log(`  ${total} accepted finding(s) outstanding`);

const stale = SYNTHETIC ? [] : Object.keys(ACCEPTED).filter((f) => !acceptedHit.has(f));
if (stale.length) {
  console.error(`\n${stale.length} ACCEPTED entr(y/ies) matched nothing: ${stale.join(", ")}`);
  console.error("remove them - the file is gone, renamed, or already clean");
  process.exit(1);
}

if (problems.length) {
  console.error(
    `\ndomain-boundaries failed. Ruling 70: "The only thing that should be deciding\n` +
      `if fulfillments is 'ready' is fulfillments." Hold an id and ask the owner -\n` +
      `fulfillments.missing(fulfillment_id) is the one call checkout makes.`
  );
  process.exit(1);
}

console.log("domain-boundaries passed");
