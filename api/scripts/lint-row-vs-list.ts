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
    `import * as addressRepo from ${Q}#db/addresses/repo.exchange.js${Q};\n` +
    `export async function run(id) {\n${body}\n}\n`;
  const LOW = { LINT_ROW_CONTROL: "addresses" };
  const base = { "db/addresses/repo.exchange.js": repo };
  await selfTest({
    script: import.meta.filename,
    cases: [
      {
        name: "a list read as a row is seen - the sales-tax bug itself",
        rootEnv: "LINT_ROW_ROOT", env: LOW,
        files: { ...base, "domain/orders/service.ts": caller(
          "  const address = await addressRepo.getAll(id);\n  return address.state;") },
        expect: "fail", mustPrint: "returns a list, but",
      },
      {
        name: "the array surface on a list is legitimate and not reported",
        rootEnv: "LINT_ROW_ROOT", env: LOW,
        files: { ...base, "domain/orders/service.ts": caller(
          "  const rowsOut = await addressRepo.getAll(id);\n  return rowsOut.map((r) => r.state);") },
        expect: "pass", mustPrint: "0 read as a row",
      },
      {
        name: "a row-returning function read as a row passes",
        rootEnv: "LINT_ROW_ROOT", env: LOW,
        files: { ...base, "domain/orders/service.ts": caller(
          "  const all = await addressRepo.getAll(id);\n" +
          "  const address = await addressRepo.getOne(id);\n" +
          "  return all.length + address.state;") },
        expect: "pass", mustPrint: "0 read as a row",
      },
      {
        name: "the known-present control fires when the repo parser stops seeing lists",
        rootEnv: "LINT_ROW_ROOT",
        files: { ...base, "domain/orders/service.ts": caller(
          "  const address = await addressRepo.getOne(id);\n  return address.state;") },
        expect: "fail", mustPrint: "known-present control",
      },
    ],
  });
}

if (!existsSync(join(ROOT, "db")) || !existsSync(join(ROOT, "domain"))) {
  console.error(`lint:row-vs-list cannot read ${join(ROOT, "db")} or ${join(ROOT, "domain")} - the walk is broken`);
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

const listReturning = new Map();
for (const file of walk(join(ROOT, "db"))) {
  if (!/(^|[\/])repo(\.\w+)?\.(js|ts)$/.test(file)) continue;
  const feature = relative(join(ROOT, "db"), file).split("/").slice(0, -1).join("/");
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

const findings = [];
let callsChecked = 0;
for (const file of ["domain", "transport"].flatMap((layer) =>
  existsSync(join(ROOT, layer)) ? walk(join(ROOT, layer)) : []
)) {
  if (/(^|[\/])repo(\.\w+)?\.(js|ts)$/.test(file)) continue;
  const src = stripComments(readFileSync(file, "utf8"));
  const nsRe = /import\s+\*\s+as\s+(\w+)\s+from\s+["']#db\/([^"']+?)\/repo(?:\.\w+)?\.(?:js|ts)["']/g;
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

const fnCount = [...listReturning.values()].reduce((n, s) => n + s.size, 0);
console.log(
  `${listReturning.size} feature(s) with ${fnCount} list-returning repo function(s) known`
);

const CONTROL = process.env.LINT_ROW_CONTROL ?? "checkout/items";
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
