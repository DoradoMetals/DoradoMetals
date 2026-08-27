// CAN A *_WIRE SWITCH MOVE YET? MEASURED FROM THE FRONTEND.
//
// CLAUDE.md: "*_SOURCE moves when the data is ready; *_WIRE moves when the
// frontend is." Nothing measured the second half. This does.
//
// A wire adapter renames fields on the way out - products.name is sent as
// product_name while PRODUCTS_WIRE is legacy. Flip the switch and the old name
// stops arriving. So the question "is the frontend ready" is answerable:
// does it still read the LEGACY names?
//
// It has to be measured rather than assumed, because the frontend does not
// import @dorado/contracts at all - only api/package.json depends on it. Every
// type the frontend has for API data is hand-written, so nothing catches a
// rename except this.
//
// WHAT IT CANNOT SEE, said plainly rather than counted as clean:
//   - Four of the seven adapters are STRUCTURAL (shared/wire/lift.ts flattens
//     or nests) rather than renames. There is no name to grep for.
//   - SPOTS_WIRE renames legacy `type` to `name`. "type" is too common a word
//     in TypeScript to count, so it is reported as unmeasurable.
//
// THE FLOOR IS THE POINT OF THIS FILE. Its first version walked zero files -
// it was run from api/ and looked for api/frontend - and reported every switch
// clear. A scan that reads nothing agrees with whatever you hoped.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname, "..");
const FRONTEND =
  process.env.WIRE_READINESS_FRONTEND_DIR ?? path.join(ROOT, "frontend");
const FEATURES = path.join(ROOT, "api", "features");

// Names too common to attribute to an API field.
const UNCOUNTABLE = new Set(["type", "name", "id", "status", "value", "data"]);

const walk = (dir, match, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next" || e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, match, out);
    else if (match.test(e.name)) out.push(full);
  }
  return out;
};

const adapters = [];
for (const file of walk(FEATURES, /wire\.ts$/)) {
  const src = fs.readFileSync(file, "utf8");
  const env =
    src.match(/env:\s*["']([A-Z_]+_WIRE)["']/)?.[1] ??
    src.match(/process\.env\.([A-Z_]+_WIRE)/)?.[1];
  if (!env) continue;
  const names = src.match(/names:\s*\{([^}]*)\}/s)?.[1];
  const renames = names
    ? [...names.matchAll(/(\w+)\s*:\s*["'](\w+)["']/g)].map((m) => ({ next: m[1], legacy: m[2] }))
    : [];
  adapters.push({ env, file: path.relative(ROOT, file), renames });
}
adapters.sort((a, b) => a.env.localeCompare(b.env));

// A test fixture spelling the legacy name IS a real occurrence - the flip
// breaks it - but it is not a component reading the wire, and conflating the
// two makes this metric move the WRONG WAY when tests get written. SPOTS_WIRE
// drifted 83 -> 86 entirely on frontend test commits, with the product code
// untouched: 86 counted, 10 of them fixtures, 76 real reads. Still counted in
// the verdict, because a flip is still work - but reported separately, so a
// switch held back only by fixtures is visible as such. The switch this
// actually endangered was MEDIA_WIRE, the one reporting ready at 0: a single
// test spelling "checksum_sha256" would report it blocked. D55.
const isTestFile = (rel) => /\.(test|spec)\.tsx?$|\.e2e\.tsx?$|(^|\/)tests?\//.test(rel);

const sources = walk(FRONTEND, /\.(ts|tsx)$/).map((f) => {
  const rel = path.relative(FRONTEND, f);
  return { rel, src: fs.readFileSync(f, "utf8"), test: isTestFile(rel) };
});

// --self-test proves the floor fires, because the floor is the whole defence:
// this script's first version walked zero files and called every switch clear.
// It re-runs THIS file against a directory that is not the frontend and
// requires a non-zero exit - exercising the floor rather than asserting it.
if (process.argv.includes("--self-test")) {
  const { spawnSync } = await import("node:child_process");
  const decoy = path.join(ROOT, "api", "scripts");
  const r = spawnSync(process.execPath, [new URL(import.meta.url).pathname], {
    env: { ...process.env, WIRE_READINESS_FRONTEND_DIR: decoy },
    encoding: "utf8",
  });
  console.log(`self-test: ran against ${path.relative(ROOT, decoy)} -> exit ${r.status}`);
  console.log(`self-test: ${(r.stderr || "").trim()}`);
  if (r.status === 0) {
    console.error("self-test FAILED - the floor let a non-frontend through");
    process.exit(1);
  }
  console.log("self-test: PASS - the floor refused it");
  process.exit(0);
}

// A scan that reads nothing accepts everything.
if (sources.length < 100) {
  console.error(
    `only ${sources.length} frontend file(s) walked from ${FRONTEND} - that is ` +
      "not the frontend, and every switch would report clear"
  );
  process.exit(1);
}

console.log(`${adapters.length} *_WIRE adapter(s), ${sources.length} frontend file(s) scanned\n`);

let blocked = 0;
for (const a of adapters) {
  if (!a.renames.length) {
    console.log(`  ?  ${a.env.padEnd(16)} structural (lift), not a rename - no name to look for`);
    continue;
  }
  const lines = [];
  let uses = 0;
  let testUses = 0;
  let unmeasurable = 0;
  for (const { next, legacy } of a.renames) {
    if (UNCOUNTABLE.has(legacy)) {
      // Too common to count globally - but not unanswerable. Scope it to the
      // files that import this feature's own frontend type, and count member
      // accesses. Narrow enough to mean something, and it is how the spot
      // pricing path was found.
      const feature = a.env.replace(/_WIRE$/, "").toLowerCase();
      const importRe = new RegExp(`from\\s+["'][^"']*features/${feature}/types["']`);
      const accessRe = new RegExp(`\\.${legacy}\\b`, "g");
      let n = 0;
      const files = new Set();
      for (const s of sources) {
        if (!importRe.test(s.src)) continue;
        const m = s.src.match(accessRe);
        if (m) { n += m.length; files.add(s.rel); }
      }
      unmeasurable += 1;
      lines.push(
        `       "${legacy}" -> "${next}"   too common to count globally; ` +
          `${n} .${legacy} access(es) in ${files.size} file(s) that import ` +
          `features/${feature}/types`
      );
      continue;
    }
    const re = new RegExp(`\\b${legacy}\\b`, "g");
    let n = 0;
    let t = 0;
    const files = new Set();
    for (const s of sources) {
      const m = s.src.match(re);
      if (m) { n += m.length; files.add(s.rel); if (s.test) t += m.length; }
    }
    uses += n;
    testUses += t;
    lines.push(
      `       "${legacy}" -> "${next}"   ${n} occurrence(s) in ${files.size} file(s)` +
        (t ? `, ${t} of them in test files` : "")
    );
  }
  const verdict = uses ? "NO " : unmeasurable ? "?  " : "yes";
  if (uses) blocked += 1;
  const split = !testUses
    ? ""
    : uses === testUses
      ? " - ALL of them test fixtures, none in product code"
      : ` (${uses - testUses} in product code, ${testUses} in tests)`;
  console.log(
    `  ${verdict} ${a.env.padEnd(16)} ${uses} legacy occurrence(s) still read by the frontend${split}`
  );
  for (const l of lines) console.log(l);
}

console.log(
  `\n${blocked} switch(es) would break the frontend today. "?" means this cannot ` +
    `answer it -\nread the adapter and the components by hand for those.`
);
