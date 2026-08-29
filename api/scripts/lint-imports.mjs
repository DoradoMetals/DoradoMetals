// Every internal import specifier must resolve to a file that exists.
//
// WHY THIS EXISTS. Renaming five service.js files to .ts left five controllers
// importing a path that no longer existed. Nothing caught it until `pnpm check`
// failed five minutes later with ERR_MODULE_NOT_FOUND across sixteen suites -
// and `tsc --noEmit` had passed, because `checkJs` is false and the importers
// were JavaScript. A green typecheck is not evidence that a rename is complete.
//
// The migration renames files constantly - repo.js became repo.exchange.js,
// repo.core.ts became repo.next.ts, and every one of those is a chance to leave
// a caller pointing at nothing. This makes that a one-second check instead of a
// five-minute one.
//
// IT ALSO CATCHES BROKEN DECLARATION FILES, which is the harder case. A .d.ts
// importing a path that does not exist is NOT a TypeScript error: every type it
// names silently becomes `any`, and `skipLibCheck: true` means tsc never opens
// the file to say so. features/leads/repo.exchange.d.ts pointed at
// ./repo.core.ts for months, which left repo.dual.ts - the file whose whole job
// is keeping the two implementations in step - with no type checking on the
// exchange half of it.
//
// Scope: relative specifiers and the `#` subpath imports declared in
// package.json. Bare package specifiers are node_modules' problem and are
// skipped.
//
// *** WHAT IT CANNOT SEE: a specifier that is not a literal. A dynamic
// `import(`./${name}.js`)` has no path to resolve, and neither does a specifier
// assembled from a variable. Bare package specifiers are skipped by design.
// Everything inside a string literal is preserved by the comment stripper, so a
// path mentioned in prose INSIDE quotes reads as an import - which is exactly
// how this file's own self-test fixtures made the real run report five
// unresolved specifiers until they were assembled at runtime instead. ***
//
// Run: pnpm --filter @dorado/api lint:imports
//      pnpm --filter @dorado/api lint:imports:self-test
import fs from "node:fs";
import path from "node:path";

// Overridable ONLY for the self-test, which points the whole script - walk,
// comment stripper, resolver and exit code - at a synthetic tree (D134).
const ROOT = process.env.LINT_IMPORTS_ROOT
  ? path.resolve(process.env.LINT_IMPORTS_ROOT)
  : path.resolve(import.meta.dirname, "..");

if (process.argv.includes("--self-test")) {
  const { selfTest } = await import("./lib/self-test.mjs");
  // FIXTURES ARE BUILT, NOT WRITTEN OUT. This lint walks api/ ENTIRELY -
  // scripts/ included - so a literal `from "./gone.js"` inside a fixture string
  // in this very file is indistinguishable from a real broken import, and the
  // first version of this self-test made the real run report five unresolved
  // specifiers that did not exist. The quote is assembled at runtime so the
  // scanner's own pattern cannot match this file's source.
  const Q = String.fromCharCode(34);
  const imp = (what, spec) => `import ${what} from ${Q}${spec}${Q};\n`;
  const base = {
    "package.json": JSON.stringify({ imports: { "#shared/*": "./shared/*", "#features/*": "./features/*" } }),
    "shared/db/query.js": "export default function query() {}\n",
    "features/a/service.js": imp("query", "#shared/db/query.js") + "export const a = () => query();\n",
  };
  const LOW = { LINT_IMPORTS_FLOOR: "1" };
  await selfTest({
    script: import.meta.filename,
    cases: [
      {
        name: "a relative specifier pointing at nothing is seen",
        rootEnv: "LINT_IMPORTS_ROOT", env: LOW,
        files: { ...base, "features/b/service.js": imp("x", "./gone.js") + "export default x;\n" },
        expect: "fail", mustPrint: "file does not exist",
      },
      {
        name: "a #subpath with no package.json entry is seen",
        rootEnv: "LINT_IMPORTS_ROOT", env: LOW,
        files: { ...base, "features/b/service.js": imp("x", "#nope/thing.js") + "export default x;\n" },
        expect: "fail", mustPrint: "no matching entry in package.json imports",
      },
      {
        name: "a .js specifier is NOT satisfied by a .ts file - the miss the negative control caught",
        rootEnv: "LINT_IMPORTS_ROOT", env: LOW,
        files: {
          ...base,
          "features/b/service.ts": "export const b = 1;\n",
          "features/c/controller.js": imp("{ b }", "../b/service.js") + "export default b;\n",
        },
        expect: "fail", mustPrint: "file does not exist",
      },
      {
        name: "a commented-out import is not evidence",
        rootEnv: "LINT_IMPORTS_ROOT", env: LOW,
        files: { ...base, "features/b/service.js": "// " + imp("x", "./gone.js") + "export const b = 1;\n" },
        expect: "pass", mustPrint: "0 unresolved",
      },
      {
        name: "a clean tree passes",
        rootEnv: "LINT_IMPORTS_ROOT", env: LOW, files: base,
        expect: "pass", mustPrint: "0 unresolved",
      },
      {
        name: "the floor itself fires on a tree far below it",
        rootEnv: "LINT_IMPORTS_ROOT", files: base,
        expect: "fail", mustPrint: "the walk is broken",
      },
    ],
  });
}
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const SUBPATHS = pkg.imports ?? {};

function sourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(js|ts|mjs|d\.ts)$/.test(entry.name)) out.push(full);
  }
  return out;
}

// `import ... from "x"`, `export ... from "x"`, and dynamic `import("x")`.
// Deliberately not a parser: this only needs the specifier, and every file here
// is ESM.
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*)["']([^"']+)["']/g;

// COMMENTS MUST GO FIRST, and this is not fussiness. The first run of this lint
// reported three failures and all three were comments: two commented-out
// provider imports in shipping/operations/registry.ts that document how a
// second carrier would be added, and a line in switch-surface.test.js
// containing the words `from "..."` inside prose. A lint that cries wolf gets
// switched off, so it strips them.
//
// Done with a small scanner rather than a regex because `//` appears inside
// every https:// string in the repo, and a naive strip would truncate the line
// and hide real imports after it.
function stripComments(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      while (i < n && src[i] !== "\n") i += 1;
    } else if (c === "/" && next === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 2;
    } else if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c;
      i += 1;
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\") {
          out += src[i] + (src[i + 1] ?? "");
          i += 2;
          continue;
        }
        out += src[i];
        i += 1;
      }
      out += quote;
      i += 1;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

/** Turns a `#subpath/...` specifier into a path, honouring the `*` wildcards. */
function resolveSubpath(spec) {
  if (SUBPATHS[spec]) return path.join(ROOT, SUBPATHS[spec]);
  for (const [pattern, target] of Object.entries(SUBPATHS)) {
    if (!pattern.endsWith("/*")) continue;
    const prefix = pattern.slice(0, -1);
    if (spec.startsWith(prefix)) {
      return path.join(ROOT, target.slice(0, -1) + spec.slice(prefix.length));
    }
  }
  return null;
}

// THE SPECIFIER MUST NAME THE FILE THAT EXISTS, EXACTLY.
//
// The first version of this accepted a `.js` specifier satisfied by a `.ts`
// file, on the reasoning that Node strips types and TypeScript's
// `allowImportingTsExtensions` blurs the two. That is wrong, and it made the
// lint miss the precise bug it was written for: the negative control - pointing
// mints/controller.js back at the deleted service.js - passed clean.
//
// Node does NOT resolve ./x.js to x.ts. `allowImportingTsExtensions` is about
// what may be WRITTEN in TypeScript source, not what Node will find at runtime,
// which is why every importer in this repo already spells out `.ts` when the
// target is TypeScript. Exact is the rule.
//
// The one accommodation: a directory, for the rare `from "./thing"` that means
// ./thing/index.js. Nothing here does that today, but rejecting it would be a
// false positive rather than a finding.
function candidates(resolved) {
  return [resolved, path.join(resolved, "index.js"), path.join(resolved, "index.ts")];
}

const problems = [];
let checked = 0;

for (const file of sourceFiles(ROOT)) {
  const src = stripComments(fs.readFileSync(file, "utf8"));
  for (const match of src.matchAll(SPECIFIER)) {
    const spec = match[1];
    let resolved = null;
    if (spec.startsWith("#")) resolved = resolveSubpath(spec);
    else if (spec.startsWith(".")) resolved = path.resolve(path.dirname(file), spec);
    else continue; // a bare package specifier

    if (resolved === null) {
      problems.push({ file, spec, why: "no matching entry in package.json imports" });
      continue;
    }
    checked += 1;
    if (!candidates(resolved).some((c) => fs.existsSync(c))) {
      problems.push({ file, spec, why: "file does not exist" });
    }
  }
}

// A LITERAL FLOOR, not a zero-check. `checked === 0` only catches a walk that
// found NOTHING; it is blind to a walk that found a tenth of the tree, which is
// the shape D120 actually took - route-guards matched one filename and reported
// success on a subset. 1309 internal specifiers resolve today and the number
// only grows with the codebase, so anything under 900 is the walk breaking.
const FLOOR = process.env.LINT_IMPORTS_ROOT
  ? Number(process.env.LINT_IMPORTS_FLOOR ?? 900)
  : 900;
if (checked < FLOOR) {
  console.error(
    `lint:imports resolved only ${checked} specifier(s), expected at least ${FLOOR} - ` +
      `the walk is broken, not the codebase clean`
  );
  process.exit(1);
}

for (const p of problems) {
  console.log(`${path.relative(ROOT, p.file)}  ->  ${p.spec}   (${p.why})`);
}

console.log(
  `\n${checked} internal import(s) checked, ${problems.length} unresolved`
);
process.exit(problems.length ? 1 : 0);
