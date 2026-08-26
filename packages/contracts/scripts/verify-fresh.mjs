// Are the committed contracts still what the database produces?
//
// CLAUDE.md: "Types come from generated contracts, never hand-written. After
// any schema change, regenerate." That is an instruction with no enforcement -
// `pnpm check` BUILDS the contracts, which compiles whatever is committed and
// says nothing about whether it still matches the schema it was generated from.
//
// A stale contract is not inert. validate:wire parses real rows through these,
// so a column added without regenerating shows up as an undeclared field and a
// dropped one as a missing field - but only for the 61 endpoint shapes it
// covers. Every table outside those is unguarded.
//
// This regenerates into a temporary directory and compares. It never writes to
// src/generated, so a failure leaves the tree exactly as it was.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const COMMITTED = path.join(HERE, "..", "src", "generated");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "contracts-fresh-"));

try {
  execFileSync(process.execPath, [path.join(HERE, "generate-tables.mjs")], {
    env: { ...process.env, CONTRACT_OUTDIR: tmp },
    stdio: "pipe",
  });

  const fresh = fs.readdirSync(tmp).filter((f) => f.endsWith(".ts")).sort();
  const committed = fs.readdirSync(COMMITTED).filter((f) => f.endsWith(".ts")).sort();

  // A comparison of nothing against nothing passes. This is the floor.
  if (fresh.length < 10) {
    console.error(`only ${fresh.length} file(s) generated - the generator did not run properly`);
    process.exit(1);
  }

  const problems = [];
  for (const f of committed) if (!fresh.includes(f)) problems.push(`${f}: committed but no longer generated`);
  for (const f of fresh) {
    if (!committed.includes(f)) { problems.push(`${f}: generated but not committed`); continue; }
    const a = fs.readFileSync(path.join(COMMITTED, f), "utf8");
    const b = fs.readFileSync(path.join(tmp, f), "utf8");
    if (a !== b) problems.push(`${f}: differs from what the database produces`);
  }

  console.log(`${fresh.length} generated contract file(s) compared against the database`);
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
