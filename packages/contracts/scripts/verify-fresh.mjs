// Are the committed contracts still what the database produces?
//
// CLAUDE.md: "Types come from generated contracts, never hand-written. After
// any schema change, regenerate." That is an instruction with no enforcement -
// `pnpm check` BUILDS the contracts, which compiles whatever is committed and
// says nothing about whether it still matches the schema it was generated from.
//
// A stale contract is not inert. validate:wire parses real rows through the
// derivations built on these rows, so a column added without regenerating
// shows up as an undeclared field and a dropped one as a missing field - but
// only for the endpoint shapes it covers. Every table outside those is
// unguarded.
//
// This regenerates into a temporary directory and compares. It never writes to
// src/, so a failure leaves the tree exactly as it was.
//
// SINCE THE ENTITY SPLIT IT COMPARES REGIONS, NOT FILES. An entity file is a
// generated region plus hand-written derivations, and a fresh generation has
// no hand section at all - so a byte-for-byte file comparison would report
// every entity as differing. What must match is the region between the two
// markers. The fully generated files - enums.ts, each schema's index.ts and
// schemas.ts - carry no hand section and are still compared whole.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const COMMITTED = path.join(HERE, "..", "src");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "contracts-fresh-"));

const START = "// generated:start";
const END = "// generated:end";

// Every .ts under a directory, as paths relative to it.
const walk = (dir, base = dir) => {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full, base));
    else if (e.name.endsWith(".ts")) out.push(path.relative(base, full));
  }
  return out.sort();
};

const region = (text, rel) => {
  const a = text.indexOf(START);
  const b = text.indexOf(END);
  if (a === -1 || b === -1 || b < a) return null;
  return text.slice(a, b + END.length);
};

try {
  execFileSync(process.execPath, [path.join(HERE, "generate-entities.mjs")], {
    env: { ...process.env, CONTRACT_OUTDIR: tmp },
    stdio: "pipe",
  });

  const fresh = walk(tmp);
  const committed = new Set(walk(COMMITTED));

  // A comparison of nothing against nothing passes. This is the floor: 90
  // tables across eighteen schemas today, and a generator that walked no
  // schema would otherwise report "everything matches".
  const FLOOR = 60;
  if (fresh.length < FLOOR) {
    console.error(`only ${fresh.length} file(s) generated - the generator did not run properly`);
    process.exit(1);
  }

  const problems = [];
  for (const rel of fresh) {
    if (!committed.has(rel)) {
      problems.push(`${rel}: generated but not committed - run generate`);
      continue;
    }
    const a = fs.readFileSync(path.join(COMMITTED, rel), "utf8");
    const b = fs.readFileSync(path.join(tmp, rel), "utf8");
    const fr = region(b, rel);
    if (fr === null) {
      // Whole-file generated: enums.ts, <schema>/index.ts, schemas.ts.
      if (a !== b) problems.push(`${rel}: differs from what the database produces`);
      continue;
    }
    const cr = region(a, rel);
    if (cr === null) problems.push(`${rel}: has no generated region`);
    else if (cr !== fr) problems.push(`${rel}: generated region differs from the database`);
  }

  // An entity whose table is gone. The generator never deletes a file, so this
  // is the only place a dropped table is reported.
  const freshSet = new Set(fresh);
  for (const rel of committed) {
    if (freshSet.has(rel)) continue;
    if (rel === "index.ts" || rel.startsWith(`computed${path.sep}`)) continue;
    const text = fs.readFileSync(path.join(COMMITTED, rel), "utf8");
    if (region(text, rel) !== null) problems.push(`${rel}: committed but its table is no longer generated`);
  }

  console.log(`${fresh.length} generated file(s) compared against the database`);
  if (problems.length) {
    console.log();
    for (const p of problems) console.log(`  ${p}`);
    console.log("\nrun: pnpm --filter @dorado/contracts generate");
    process.exit(1);
  }
  console.log("every one matches - nothing regenerated, nothing changed");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
