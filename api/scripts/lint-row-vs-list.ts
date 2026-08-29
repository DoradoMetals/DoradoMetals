// Finds a repo function that returns a LIST being read as if it were a ROW.
//
// WHY THIS EXISTS. what is now features/orders/service.ts did
//
//     const address = await addressRepo.getFromId(id);
//     ... address.state ...
//
// and getFromId returns `rows`. `.state` on an array is undefined, so every
// sales order was taxed in no state at all from 6 January 2026 (4e5b97e0).
// Nothing caught it: a repo.js facade resolves its implementation with
// SOURCES[SOURCE], and a dynamic index erases every export to `any`.
//
// So this is a syntactic check rather than a type one. It reads each
// repo.exchange.js to learn which exported functions end in `return rows` (a
// list) versus `return rows[0]` (a row), then looks for callers that assign one
// of the list-returning ones to a name and read a property off that name.
//
// Property reads only. `x.length`, `x[0]`, `x.map(...)`, `x.filter(...)` and
// the rest of the array surface are all legitimate uses of a list.
//
// *** WHAT IT CANNOT SEE. The pattern it matches is narrow on purpose, and the
// narrowness is the blind spot: ***
//   - A DESTRUCTURED RESULT: `const { state } = await repo.getFromId(id)`. That
//     is the same bug and yields undefined the same way.
//   - A RESULT CHAINED IMMEDIATELY: `(await repo.getFromId(id)).state`.
//   - A RESULT PASSED ON and read by the callee - there is no name here to
//     misread, which is the stated scope, but the bug survives the journey.
//   - A REPO FUNCTION WHOSE RETURN IS NOT LITERALLY `return rows;` - a mapped
//     list (`return rows.map(...)`) is a list and is not classified as one.
//   - ANY FEATURE WITHOUT a repo.exchange/repo.next pair. Most features are
//     restructured now, so this knows about very few functions - which is what
//     the known-present control below exists to keep honest.
//
// Run: pnpm --filter @dorado/api lint:row-vs-list
//      pnpm --filter @dorado/api lint:row-vs-list:self-test
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.env.LINT_ROW_ROOT
  ? process.env.LINT_ROW_ROOT.replace(/\/?$/, "/")
  : new URL("..", import.meta.url).pathname;

if (process.argv.includes("--self-test")) {
  const { selfTest } = await import("./lib/self-test-harness.ts");
  const Q = String.fromCharCode(34);
  const repo = `export async function getAll(id) {
  const { rows } = await query("SELECT 1", [id]);
  return rows;
}
export async function getOne(id) {
  const { rows } = await query("SELECT 1", [id]);
  return rows[0];
}
`;
  const caller = (body: string) =>
    `import * as addressRepo from ${Q}#features/addresses/repo.exchange.js${Q};\n` +
    `export async function run(id) {\n${body}\n}\n`;
  const LOW = { LINT_ROW_CONTROL: "addresses" };
  const base = { "features/addresses/repo.exchange.js": repo };
  await selfTest({
    script: import.meta.filename,
    cases: [
      {
        name: "a list read as a row is seen - the sales-tax bug itself",
        rootEnv: "LINT_ROW_ROOT", env: LOW,
        files: { ...base, "features/orders/service.ts": caller(
          "  const address = await addressRepo.getAll(id);\n  return address.state;") },
        expect: "fail", mustPrint: "returns a list, but",
      },
      {
        name: "the array surface on a list is legitimate and not reported",
        rootEnv: "LINT_ROW_ROOT", env: LOW,
        files: { ...base, "features/orders/service.ts": caller(
          "  const rowsOut = await addressRepo.getAll(id);\n  return rowsOut.map((r) => r.state);") },
        expect: "pass", mustPrint: "0 read as a row",
      },
      {
        name: "a row-returning function read as a row passes",
        rootEnv: "LINT_ROW_ROOT", env: LOW,
        // The list call is present too, and used correctly - without it the
        // zero-call floor fires and the case would pass for the wrong reason.
        files: { ...base, "features/orders/service.ts": caller(
          "  const all = await addressRepo.getAll(id);\n" +
          "  const address = await addressRepo.getOne(id);\n" +
          "  return all.length + address.state;") },
        expect: "pass", mustPrint: "0 read as a row",
      },
      {
        name: "the known-present control fires when the repo parser stops seeing lists",
        rootEnv: "LINT_ROW_ROOT",
        files: { ...base, "features/orders/service.ts": caller(
          "  const address = await addressRepo.getOne(id);\n  return address.state;") },
        expect: "fail", mustPrint: "known-present control",
      },
    ],
  });
}

if (!existsSync(join(ROOT, "features"))) {
  console.error(`lint:row-vs-list cannot read ${join(ROOT, "features")} - the walk is broken`);
  process.exit(2);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|ts)$/.test(name) && !/\.test\.(js|ts)$/.test(name)) out.push(p);
  }
  return out;
}

// Strip comments so a commented-out example is not evidence. Character scanner,
// not a regex - `//` appears inside every https:// string.
function stripComments(src: string): string {
  let out = "", i = 0, s = null;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (s) {
      out += c;
      if (c === "\\") { out += src[i + 1] ?? ""; i += 2; continue; }
      if (c === s) s = null;
      i++; continue;
    }
    if (c === '"' || c === "'" || c === "`") { s = c; out += c; i++; continue; }
    if (c === "/" && n === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && n === "*") { i += 2; while (i < src.length && !(src[i] === "*" && src[i+1] === "/")) i++; i += 2; continue; }
    out += c; i++;
  }
  return out;
}

const ARRAY_OK = new Set([
  "length", "map", "filter", "forEach", "find", "findIndex", "some", "every",
  "reduce", "slice", "sort", "flat", "flatMap", "includes", "indexOf", "join",
  "at", "concat", "reverse", "entries", "keys", "values", "push", "pop",
  "shift", "unshift", "splice",
]);

// 1. Which exported repo functions return a list?
const listReturning = new Map(); // feature -> Set(fnName)
for (const file of walk(join(ROOT, "features"))) {
  if (!/repo\.(exchange|next)\.(js|ts)$/.test(file)) continue;
  const feature = relative(join(ROOT, "features"), file).split("/").slice(0, -1).join("/");
  const src = stripComments(readFileSync(file, "utf8"));
  const fnRe = /export\s+(?:async\s+)?function\s+(\w+)\s*\(/g;
  let m;
  const bounds = [];
  while ((m = fnRe.exec(src))) bounds.push({ name: m[1], start: m.index });
  for (let i = 0; i < bounds.length; i++) {
    const body = src.slice(bounds[i].start, bounds[i + 1]?.start ?? src.length);
    const returnsList = /return\s+(?:\w+\.)?rows\s*;/.test(body);
    const returnsRow = /return\s+(?:\w+\.)?rows\s*\[0\]/.test(body);
    if (returnsList && !returnsRow) {
      if (!listReturning.has(feature)) listReturning.set(feature, new Set());
      listReturning.get(feature).add(bounds[i].name);
    }
  }
}

// 2. Which namespaces point at which feature's repo?
const findings = [];
let callsChecked = 0;
for (const file of walk(join(ROOT, "features"))) {
  if (/repo\.(exchange|dual|next)\./.test(file)) continue;
  const src = stripComments(readFileSync(file, "utf8"));
  const nsRe = /import\s+\*\s+as\s+(\w+)\s+from\s+["']#features\/([^"']+?)\/repo(?:\.\w+)?\.(?:js|ts)["']/g;
  const nsToFeature = new Map();
  let m;
  while ((m = nsRe.exec(src))) nsToFeature.set(m[1], m[2]);
  if (!nsToFeature.size) continue;

  for (const [ns, feature] of nsToFeature) {
    const fns = listReturning.get(feature);
    if (!fns) continue;
    const callRe = new RegExp(`(?:const|let|var)\\s+(\\w+)\\s*=\\s*await\\s+${ns}\\.(\\w+)\\s*\\(`, "g");
    let c;
    while ((c = callRe.exec(src))) {
      const [, varName, fnName] = c;
      if (!fns.has(fnName)) continue;
      callsChecked++;
      const useRe = new RegExp(`\\b${varName}\\.(\\w+)`, "g");
      let u;
      while ((u = useRe.exec(src))) {
        if (u.index < c.index) continue;
        if (ARRAY_OK.has(u[1])) continue;
        const line = src.slice(0, u.index).split("\n").length;
        findings.push({
          file: relative(ROOT, file), line,
          text: `${varName} = await ${ns}.${fnName}(...) returns a list, but \`${varName}.${u[1]}\` reads a property off it`,
        });
      }
    }
  }
}

// Reach, printed always. A zero-finding run means nothing without it: this
// check only sees `const x = await ns.fn(...)`, so a caller that passes the
// result straight on, or destructures it, is invisible - and those cannot carry
// this bug anyway, since there is no name to misread.
const fnCount = [...listReturning.values()].reduce((n, s) => n + s.size, 0);
console.log(
  `${listReturning.size} feature(s) with ${fnCount} list-returning repo function(s) known`
);

// A KNOWN-PRESENT CONTROL, not just a zero-check. audit:query-paths' lesson
// (D142's neighbour): a bare floor is blind to PARTIAL breakage, and this
// script's numbers are small enough that "some" and "all" look alike. `checkout`
// is the feature whose repo.exchange.js has list-returning exports today; if
// the repo parser stops seeing them, this reports zero findings and exits 0
// while auditing nothing.
const CONTROL = process.env.LINT_ROW_CONTROL ?? "checkout";
if (!listReturning.has(CONTROL)) {
  console.error(
    `the known-present control "${CONTROL}" contributed no list-returning repo ` +
      `function - the repo parser has broken, not the codebase gone clean. ` +
      `If ${CONTROL} genuinely lost its list-returning exports, move the control ` +
      `to another feature deliberately.`
  );
  process.exit(2);
}

if (!callsChecked) {
  console.error("lint:row-vs-list resolved no calls at all - the check is not working");
  process.exit(2);
}
for (const f of findings) console.error(`${f.file}:${f.line}  ${f.text}`);
console.log(`${callsChecked} list-returning repo call(s) checked, ${findings.length} read as a row`);
process.exit(findings.length ? 1 : 0);
