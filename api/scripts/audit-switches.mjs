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

import fs from "node:fs";
import path from "node:path";

import "#env";

const ROOT = new URL("..", import.meta.url).pathname;
const FEATURES = path.join(ROOT, "features");

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
  for (const helper of ["rename.ts", "lift.ts"]) {
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
const SOURCE_FLOOR = 20; // leads restructured; was 21
const WIRE_FLOOR = 7;
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

console.log("no switch is set to a value it does not have");
