// EVERY *_SOURCE AND *_WIRE SWITCH, AGAINST THE VALUE THE ENVIRONMENT HOLDS.
//
// WHY THIS EXISTS. Each switch resolves like this:
//
//   const SOURCE = Object.hasOwn(SOURCES, process.env.LEADS_SOURCE ?? "")
//     ? process.env.LEADS_SOURCE : "exchange";
//
// An unrecognised value is NOT an error. It falls back to `exchange`, silently.
// features/leads/repo.js says so in its own comment: a setting SOURCES does not
// contain "reads as a working promotion and is not one".
//
// That is the failure this catches. `LEADS_SOURCE=duel` starts cleanly, logs
// nothing, and `diff leads` still passes - because diff compares the two
// implementations, not which one is live. Everything looks promoted. Nothing
// is. The new schema quietly stops receiving the rows it was supposed to be
// dual-written, and the moment anybody drops exchange.leads on the strength of
// "dual has been running for weeks", those rows are the ones that were only
// ever in one place.
//
// shared/db/switch-surface.test.js already checks the STRUCTURE of every switch
// - that each function exists in every state it can select. This checks the
// other axis: whether the VALUE an operator actually set is one the switch has
// heard of. Neither catches the other's case.
//
// Exit 1 on an unrecognised value. Unset is fine and is the normal state.
//
// *** WHAT THE BYPASS SCAN CANNOT SEE, and one of these is bigger than the case
// it was written for: ***
//   - RAW SQL IN A SERVICE. A feature that never imports a repo at all and
//     writes `SELECT ... FROM products.bullion` inline reaches the new schema
//     with no import to find. features/quotes/service.ts does exactly this
//     ALONGSIDE the import below (it imports `query` directly). audit:query-paths
//     walks those statements; this does not.
//   - A RE-EXPORT. `export * from "./repo.next.ts"` in some third file, imported
//     from there, resolves to a specifier this does not recognise.
//   - A DYNAMIC IMPORT built from a variable.
//   - A SWITCH READ ANYWHERE BUT features/*/repo.js. The facade shape is
//     assumed; a switch that moved would leave `facadeOf` empty, which is why
//     an empty facade set is a refusal rather than a clean report.
//
// AND IT NOW ANSWERS THE OTHER HALF OF THE QUESTION (D142). A switch describes
// `repo.js`. It says NOTHING about who imports AROUND it. The case this was
// built for - since FIXED, which is why the pin list below is empty -
// was `features/quotes/service.ts`:
//
//     import * as checkoutRepo from "#features/checkout/repo.next.ts";
//
// calling `findProductIdByName`, whose statement is `SELECT id FROM
// products.bullion`. So this audit could report CHECKOUT_SOURCE=exchange, be
// telling the truth about the switch, and the feature read the new schema
// anyway. A switch audit that cannot see a bypass is another instrument
// answering a narrower question than the one being asked of it.
//
// TYPE-ONLY IMPORTS ARE NOT BYPASSES and are not reported. `import type { Row }
// from ".../repo.next.ts"` compiles away entirely - it reaches no schema.
// Both features/checkout/service.ts and features/payments/service.ts do exactly
// that, and calling them bypasses would be three findings where there is one,
// which is how a guard gets switched off.

import fs from "node:fs";
import path from "node:path";

import "#env";

const ROOT = process.env.AUDIT_SWITCHES_ROOT
  ? process.env.AUDIT_SWITCHES_ROOT.replace(/\/?$/, "/")
  : new URL("..", import.meta.url).pathname;
const FEATURES = path.join(ROOT, "features");

if (process.argv.includes("--self-test")) {
  const { selfTest } = await import("./lib/self-test.mjs");
  const Q = String.fromCharCode(34);
  const facade = (env) => `import * as exchange from ${Q}./repo.exchange.js${Q};
import * as dual from ${Q}./repo.dual.js${Q};
const SOURCES = { exchange, dual };
const SOURCE = Object.hasOwn(SOURCES, process.env.${env} ?? "")
  ? process.env.${env}
  : "exchange";
export const getThing = SOURCES[SOURCE].getThing;
`;
  const base = () => ({
    "features/cart/repo.js": facade("CART_SOURCE"),
    "features/cart/repo.exchange.js": "export const getThing = () => {};\n",
    "features/cart/repo.next.ts": "export const getThing = () => {};\nexport type Row = { id: string };\n",
    "features/cart/repo.dual.js": `import * as next from ${Q}#features/cart/repo.next.ts${Q};\nexport const getThing = next.getThing;\n`,
    "features/bill/repo.js": facade("BILL_SOURCE"),
    "features/bill/repo.exchange.js": "export const getThing = () => {};\n",
    "features/bill/repo.next.ts": "export const getThing = () => {};\n",
    "features/bill/repo.dual.js": `import * as next from ${Q}#features/bill/repo.next.ts${Q};\nexport const getThing = next.getThing;\n`,
    "shared/wire/rename.ts": 'const SHAPES = { legacy: 1, next: 2 };\nexport default SHAPES;\n',
  });
  await selfTest({
    script: import.meta.filename,
    cases: [
      {
        name: "a VALUE import around the switch is seen as a bypass (D142)",
        rootEnv: "AUDIT_SWITCHES_ROOT",
        files: { ...base(), "features/quotes/service.ts":
          `import * as cartRepo from ${Q}#features/cart/repo.next.ts${Q};\nexport const q = () => cartRepo.getThing();\n` },
        expect: "fail", mustPrint: "BYPASS",
      },
      {
        name: "a type-only import is NOT a bypass - it compiles away",
        rootEnv: "AUDIT_SWITCHES_ROOT",
        files: { ...base(), "features/quotes/service.ts":
          `import type { Row } from ${Q}#features/cart/repo.next.ts${Q};\nexport const q = (r: Row) => r;\n` },
        expect: "pass", mustPrint: "no import reaches around a switch",
      },
      {
        name: "the dual mirror importing next is not a bypass - dual is a STATE of the switch",
        rootEnv: "AUDIT_SWITCHES_ROOT",
        files: base(),
        expect: "pass", mustPrint: "no import reaches around a switch",
      },
      {
        name: "a listed bypass is suppressed rather than reported",
        rootEnv: "AUDIT_SWITCHES_ROOT",
        env: { AUDIT_SWITCHES_KNOWN: "features/quotes/service.ts -> features/cart" },
        files: { ...base(), "features/quotes/service.ts":
          `import * as cartRepo from ${Q}#features/cart/repo.next.ts${Q};\nexport const q = () => cartRepo.getThing();\n` },
        expect: "pass", mustPrint: "known  features/quotes/service.ts -> features/cart",
      },
      {
        name: "a listed bypass that stopped reporting FAILS, so the pin cannot outlive it",
        rootEnv: "AUDIT_SWITCHES_ROOT",
        env: { AUDIT_SWITCHES_KNOWN: "features/gone/service.ts -> features/cart" },
        files: base(),
        expect: "fail", mustPrint: "STALE",
      },
      {
        name: "a direct repo.exchange import is a bypass too - on dual it skips the mirrored write",
        rootEnv: "AUDIT_SWITCHES_ROOT",
        files: { ...base(), "features/quotes/service.ts":
          `import * as cartRepo from ${Q}#features/cart/repo.exchange.js${Q};\nexport const q = () => cartRepo.getThing();\n` },
        expect: "fail", mustPrint: "BYPASS",
      },
      {
        name: "the switch floor still fires when the parser stops understanding an idiom",
        rootEnv: "AUDIT_SWITCHES_ROOT",
        files: (() => { const f = base(); delete f["features/bill/repo.js"]; return f; })(),
        expect: "fail", mustPrint: "this parser has stopped understanding an idiom",
      },
      {
        name: "the bypass scan refuses to report clean when it found no facades at all",
        rootEnv: "AUDIT_SWITCHES_ROOT",
        files: { "shared/wire/rename.ts": 'const SHAPES = { legacy: 1, next: 2 };\nexport default SHAPES;\n' },
        expect: "fail",
      },
    ],
  });
}

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(js|ts)$/.test(e.name) && !e.name.includes(".test.")) out.push(full);
  }
  return out;
};

// `const SOURCES = { exchange, dual }` -> ["exchange", "dual"]
const statesIn = (src, mapName) => {
  // The TYPE ANNOTATION is optional and was the reason this found zero *_WIRE
  // switches on its first run: payments/wire.ts declares
  // `const SHAPES: Record<string, RowFn> = { ... }`, and a pattern that went
  // straight from the name to `=` matched none of the seven.
  const body =
    src.match(new RegExp(`const ${mapName}(?:\\s*:[^=]+)?\\s*=\\s*\\{([^}]*)\\}`))?.[1] ?? "";
  return body
    .split(",")
    .map((s) => s.trim().split(":")[0].trim())
    .filter((s) => /^[A-Za-z0-9_]+$/.test(s));
};

const switches = [];
for (const file of walk(FEATURES)) {
  const src = fs.readFileSync(file, "utf8");
  for (const [mapName, suffix] of [["SOURCES", "_SOURCE"], ["SHAPES", "_WIRE"]]) {
    const varName = src.match(new RegExp(`process\\.env\\.([A-Z_]+${suffix})`))?.[1];
    if (!varName) continue;
    const states = statesIn(src, mapName);
    if (!states.length) continue;
    // The fallback is the literal in the ternary's else branch.
    // The else branch of the ternary, which may sit lines below the condition
    // and behind a cast - `? (process.env.PAYMENTS_WIRE as string)\n : "legacy"`.
    const after = src.slice(src.indexOf(`process.env.${varName}`));
    const fallback = after.match(/:\s*["']([a-z]+)["']\s*;/)?.[1] ?? states[0];
    switches.push({
      varName,
      states,
      fallback,
      file: path.relative(ROOT, file),
      kind: suffix === "_SOURCE" ? "source" : "wire",
    });
  }
}

// THE THIRD IDIOM, and the one that made this check nearly useless. Six of the
// seven *_WIRE switches are not written out at all - they are declarations
// handed to a shared helper:
//
//   makeWireAdapter({ env: "PRODUCTS_WIRE", names: { ... } })
//
// and the states live in shared/wire/rename.ts and lift.ts, each of which
// declares `const SHAPES: Record<string, RowFn> = { legacy: ..., next: ... }`
// and falls back to "legacy". Read from those files rather than hardcoded, so
// that adding a third shape to the helper is picked up here rather than
// silently accepted.
const helperStates = () => {
  const states = new Set();
  let fallback;
  // lift.ts was deleted with the addresses conversion (2026-08-27, the last
  // lift); rename.ts is the one helper left, and a helper file listed here
  // that stops existing should fail loudly rather than be skipped.
  for (const helper of ["rename.ts"]) {
    const src = fs.readFileSync(path.join(ROOT, "shared", "wire", helper), "utf8");
    for (const st of statesIn(src, "SHAPES")) states.add(st);
    fallback ??= src.match(/:\s*["']([a-z]+)["']\s*;/)?.[1];
  }
  return { states: [...states], fallback: fallback ?? "legacy" };
};

{
  const { states, fallback } = helperStates();
  const declared = new Set(switches.map((s) => s.varName));
  for (const file of walk(FEATURES)) {
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(/env:\s*["']([A-Z_]+_WIRE)["']/g)) {
      if (declared.has(m[1])) continue;
      declared.add(m[1]);
      switches.push({
        varName: m[1],
        states,
        fallback,
        file: path.relative(ROOT, file),
        kind: "wire",
      });
    }
  }
}

switches.sort((a, b) => a.varName.localeCompare(b.varName));

// A check that finds nothing accepts everything, so the count has a floor: if it
// drops, the usual cause is this parser no longer understanding an idiom rather
// than the codebase genuinely losing a switch.
//
// THE FLOOR COMES DOWN BY ONE EACH TIME A FEATURE IS RESTRUCTURED, and that has
// to be deliberate. A restructured feature reads the new schema and writes both
// unconditionally, so it has no switch to select an implementation - there is
// only one. Leads was the first: 21 -> 20.
//
// Lowering this is therefore a real decision and not bookkeeping. Do it only
// alongside the commit that removes the feature's repo.js, and never to make a
// red build green - a count that falls on its own is the parser breaking.
const SOURCE_FLOOR = 2; // purchase orders pivoted with the wave-2 read flip; was 3
// READY: flip to 0 with PAYMENTS_WIRE. The payments adapter - the last *_WIRE
// switch - is staged for deletion in the same gate as the frontend conversion,
// and at 0 the zero-state branch below takes over from the floor:
// shared/wire/adapter.test.js's precedent, where zero adapters became the
// ASSERTED state once the last one converted. A *_WIRE switch REAPPEARING
// after that means someone is adding a legacy shim after the conversion - a
// deliberate decision, made by flipping this back to a floor.
const WIRE_FLOOR = 0; // six converted 2026-08-27, addresses the last lift; payments is the one left; was 7
{
  const sources = switches.filter((s) => s.kind === "source").length;
  const wires = switches.filter((s) => s.kind === "wire").length;
  if (sources < SOURCE_FLOOR || wires < WIRE_FLOOR) {
    console.error(
      `only ${sources} *_SOURCE and ${wires} *_WIRE switch(es) found, expected at ` +
        `least ${SOURCE_FLOOR} and ${WIRE_FLOOR} - this parser has stopped understanding an idiom`
    );
    process.exit(1);
  }
  if (WIRE_FLOOR === 0 && wires !== 0) {
    console.error(
      `a *_WIRE switch appeared (${switches
        .filter((s) => s.kind === "wire")
        .map((s) => s.varName)
        .join(", ")}) - every wire adapter is converted; flip WIRE_FLOOR back ` +
        `to a floor deliberately`
    );
    process.exit(1);
  }
}

const bad = [];
const set = [];
for (const s of switches) {
  const value = process.env[s.varName];
  if (value === undefined || value === "") continue;
  set.push(s);
  if (!s.states.includes(value)) bad.push({ ...s, value });
}

const sources = switches.filter((s) => s.kind === "source").length;
const wires = switches.filter((s) => s.kind === "wire").length;

console.log(
  `${switches.length} switch(es) found - ${sources} *_SOURCE, ${wires} *_WIRE`
);
console.log(`${set.length} set in this environment, ${switches.length - set.length} unset (the default)`);

if (process.argv.includes("--list")) {
  for (const s of switches) {
    const value = process.env[s.varName];
    const shown = value === undefined || value === "" ? `(unset -> ${s.fallback})` : value;
    const ok = value === undefined || value === "" || s.states.includes(value);
    console.log(
      `  ${ok ? " " : "!"} ${s.varName.padEnd(28)} ${shown.padEnd(22)} of [${s.states.join(", ")}]`
    );
  }
}

if (bad.length) {
  console.error(`\n${bad.length} switch(es) are SET TO A VALUE THAT DOES NOT EXIST:\n`);
  for (const b of bad) {
    console.error(`  ${b.varName}=${b.value}`);
    console.error(`     ${b.file} offers only [${b.states.join(", ")}]`);
    console.error(
      `     This does NOT fail at runtime. It falls back to "${b.fallback}" ` +
        `silently, so it reads as a working promotion and is not one.\n`
    );
  }
  process.exit(1);
}

// ============================================================================
// BYPASSES: WHO IMPORTS AROUND THE SWITCH (D142)
// ============================================================================
//
// A `*_SOURCE` switch lives in `features/<f>/repo.js`. Everything that reads
// the feature through that facade obeys it. Anything importing
// `repo.next.*` or `repo.exchange.*` DIRECTLY has pinned an implementation, and
// no value of the switch will move it.
//
// Both directions matter and for different reasons. A direct `repo.next` import
// reads the new schema while the switch says `exchange` - the D142 case. A
// direct `repo.exchange` import keeps reading the old schema after promotion,
// and on `dual` it skips the mirrored write, which is the half that loses rows.
//
// NOT BYPASSES, and each exclusion is a claim rather than convenience:
//   - `repo.dual.*` imports `repo.next.*` by construction. `dual` IS a state of
//     the switch; that import is the switch working.
//   - `repo.js` itself imports every state it can select.
//   - `import type` compiles away. It reaches no schema and cannot read a row.
//   - tests import implementations directly on purpose - that is how `diff` and
//     the parity checks compare the two.
//   - scripts/ likewise: validate:wire deliberately parses BOTH implementations,
//     which is the whole of `bothWays`.
const IMPL = /repo\.(next|exchange)\.(?:ts|js)$/;

// PINNED FROM BOTH SIDES, exactly like audit:query-paths' ACCEPTED. An
// unlisted bypass fails; a listed one that has stopped reporting ALSO fails, so
// the entry cannot outlive the thing it excuses.
// EMPTY, AND THAT IS THE POINT. Its one entry was
// `features/quotes/service.ts -> features/checkout` (D142) and it is gone
// because the bypass is: the quote surface now resolves a product name through
// `features/products/service.ts`, the feature that owns products.bullion, so
// there is no second implementation to reach around. Deleted the same pass the
// fix landed, on this file's own instruction - a stale exclusion silently
// excuses the next one.
const REAL_KNOWN_BYPASSES = {};

// Under --self-test the tree is synthetic, so the real pin list would report
// every entry stale on every case. The fixture declares its own instead, which
// is what lets BOTH halves of the pin be attacked: a listed bypass must be
// suppressed, and a listed one that stopped reporting must fail.
const KNOWN_BYPASSES = process.env.AUDIT_SWITCHES_ROOT
  ? Object.fromEntries(
      (process.env.AUDIT_SWITCHES_KNOWN ?? "")
        .split("|")
        .filter(Boolean)
        .map((k) => [k, "declared by the self-test fixture"])
    )
  : REAL_KNOWN_BYPASSES;

const bypassRoots = ["features", "shared", "legacy"]
  .map((d) => path.join(ROOT, d))
  .filter((d) => fs.existsSync(d));

// Which features have a facade at all? Only those can be bypassed.
const facadeOf = new Map(); // feature dir name -> switch var
for (const sw of switches) {
  if (sw.kind !== "source") continue;
  if (path.basename(sw.file) !== "repo.js") continue;
  facadeOf.set(path.dirname(sw.file).replace(/^features\//, ""), sw.varName);
}

// A scan that found no facades cannot find a bypass, and must not say "clean".
// This is the floor for the bypass half specifically: the switch floor above
// counts switches wherever they live, and would not notice the facade shape
// changing out from under this.
if (facadeOf.size === 0) {
  console.error(
    "\nthe bypass scan found no features/*/repo.js facade at all - it cannot see " +
      "a bypass and must not report one way or the other"
  );
  process.exit(1);
}

const IMPORT = /\bimport\s+(type\s+)?([^;'"]*?)\s*from\s*["']([^"']+)["']/g;
const bypasses = [];
let importsExamined = 0;

const bypassWalk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) bypassWalk(full, out);
    else if (/\.(js|ts)$/.test(e.name) && !e.name.includes(".test.")) out.push(full);
  }
  return out;
};

for (const dir of bypassRoots) {
  for (const file of bypassWalk(dir)) {
    const rel = path.relative(ROOT, file);
    const base = path.basename(file);
    // The facade and the dual mirror are the switch, not a way around it.
    if (base === "repo.js" || /^repo\.dual\./.test(base)) continue;
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(IMPORT)) {
      const [, typeKw, clause, spec] = m;
      if (!IMPL.test(spec)) continue;
      importsExamined += 1;
      // `import type X from` and `import { type A, type B } from` both compile
      // away. A clause mixing the two does not.
      const specifiers = clause.replace(/^\{|\}$/g, "").split(",").map((x) => x.trim()).filter(Boolean);
      const typeOnly =
        Boolean(typeKw) ||
        (clause.trim().startsWith("{") && specifiers.length > 0 &&
          specifiers.every((x) => /^type\s/.test(x)));
      if (typeOnly) continue;

      const feature = spec.startsWith("#features/")
        ? spec.slice("#features/".length).replace(/\/repo\.[^/]+$/, "")
        : path
            .relative(FEATURES, path.resolve(path.dirname(file), spec))
            .replace(/\/repo\.[^/]+$/, "");
      if (!facadeOf.has(feature)) continue;      // no switch to go around
      if (rel.startsWith(`features/${feature}/`)) continue; // the feature's own internals
      bypasses.push({
        file: rel,
        line: src.slice(0, m.index).split("\n").length,
        feature,
        env: facadeOf.get(feature),
        impl: spec.match(IMPL)[1],
        key: `${rel} -> features/${feature}`,
      });
    }
  }
}

console.log(
  `\nbypass scan: ${facadeOf.size} switched facade(s), ${importsExamined} direct ` +
    `import(s) of an implementation examined`
);

const unknown = bypasses.filter((b) => !KNOWN_BYPASSES[b.key]);
const known = bypasses.filter((b) => KNOWN_BYPASSES[b.key]);

for (const b of known) {
  console.log(`  known  ${b.key} (${b.impl})\n           ${KNOWN_BYPASSES[b.key]}`);
}

const reported = new Set(bypasses.map((b) => b.key));
const staleBypass = Object.keys(KNOWN_BYPASSES).filter((k) => !reported.has(k));

if (unknown.length) {
  console.error(`\n${unknown.length} BYPASS(ES) - code reading around a *_SOURCE switch:\n`);
  for (const b of unknown) {
    console.error(`  ${b.file}:${b.line}  imports features/${b.feature}/repo.${b.impl}.* directly`);
    console.error(
      `     ${b.env} selects features/${b.feature}/repo.js and this import does not go ` +
        `through it. The switch can read "exchange" and be telling the truth while this ` +
        `line reads the other schema.\n`
    );
  }
}

if (staleBypass.length) {
  console.error(
    `\n${staleBypass.length} KNOWN_BYPASSES entr(ies) no longer report - the bypass was ` +
      `fixed. DELETE the entry from scripts/audit-switches.mjs; an exclusion that ` +
      `outlives its subject silently excuses the next one:\n`
  );
  for (const k of staleBypass) console.error(`  STALE  ${k}`);
}

if (!bypasses.length) console.log("  no import reaches around a switch");

if (unknown.length || staleBypass.length) process.exit(1);

console.log("no switch is set to a value it does not have");
