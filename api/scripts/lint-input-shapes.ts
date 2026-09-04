// Two checks, one gate.
//
// (1) Every write-facing input shape in api/domain/** (type/interface ending
// Create/New/Patch/Input/Body) names only columns its repo call can reach.
// Finds e.g. ShipmentCreate carrying purchase_order_id/sales_order_id for a
// table that never had either column, or carrying an accepted-never-read
// field like carrier_id - both invisible to `tsc`, which only checks that a
// value HAS the fields a function reads, never that a field a type OFFERS is
// read by anything.
//
// (2) Every builder in api/shared/testing/builders/*.ts takes its options as
// a contract's New/Patch type (or a Partial of it), never a local `type
// XOptions`. A local options type is itself the finding.
//
//   node scripts/lint-input-shapes.ts
//   node scripts/lint-input-shapes.ts --self-test
//
// Exits non-zero on any unaccepted finding, or a stale ACCEPTED entry.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.env.LINT_INPUT_SHAPES_ROOT
  ?? path.resolve(import.meta.dirname, "..", "..");
const DOMAIN_ROOT = path.join(ROOT, "api", "domain");
const DB_ROOT = path.join(ROOT, "api", "db");
const BUILDERS_ROOT = path.join(ROOT, "api", "shared", "testing", "builders");
// ONE FILE PER ENTITY since the contracts restructure: src/<schema>/<table>.ts,
// each with a generated region whose only `export const Row = z.object({...})`
// is the table. The old src/generated/<schema>.ts held every table of a schema
// under a PascalRow name; when it went, this resolved nothing, every lookup
// returned null, and the "SCAN IS BROKEN" floor is what said so.
const CONTRACTS_ROOT = path.join(ROOT, "packages", "contracts", "src");

// Genuine non-column inputs ("Type.field") and genuine local builder options
// types ("Options:Type") this lint would otherwise flag. PINNED FROM BOTH
// SIDES like lint-type-homes' ACCEPTED: an entry matching nothing is reported
// and must be removed.
const ACCEPTED: Record<string, string> = {
  // Every builder but transactions.ts predates this check and keeps a local
  // Options type - pre-existing, out of this lane's mandate (order-id,
  // 2026-09-03). Not touched here; fix each when its own lane is touched.
  "Options:CartOptions": "pre-existing (checkout.ts) - not this lane's file.",
  "Options:LotOptions": "pre-existing (checkout.ts/orders.ts) - not this lane's file.",
  "Options:LeadOptions": "pre-existing (leads.ts) - not this lane's file.",
  "Options:OrderOptions": "pre-existing (orders.ts) - not this lane's file.",
  "Options:BullionOptions": "pre-existing (orders.ts) - not this lane's file.",
  "Options:PayoutOptions": "pre-existing (payments.ts) - not this lane's file.",
  "Options:IntentOptions": "pre-existing (payments.ts) - not this lane's file.",
  "Options:AddressOptions": "pre-existing (places.ts) - not this lane's file.",
  "Options:ProductOptions": "pre-existing (products.ts) - not this lane's file.",
  "Options:EngagementOptions": "pre-existing (refiners.ts) - not this lane's file.",
  "Options:ReviewOptions": "pre-existing (reviews.ts) - not this lane's file.",
  "Options:ShipmentOptions": "pre-existing (shipping.ts) - not this lane's file.",
  "Options:UserOptions": "pre-existing (users.ts) - not this lane's file.",
};

const acceptedHit = new Set<string>();

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e === "node_modules" || e === ".git" || e === "dist") continue;
    const full = path.join(dir, e);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) walk(full, out);
    else if (/\.ts$/.test(full) && !/\.test\.ts$/.test(full) && !/[\\/]tests[\\/]/.test(full)) {
      out.push(full);
    }
  }
  return out;
}

type Candidate = { name: string; file: string; line: number; keys: string[] };

const lineOf = (src: string, i: number) => src.slice(0, i).split("\n").length;

// The top-level keys of an object-literal type/interface body (braces
// included). Depth-tracked so a nested object's own keys are not attributed
// to the outer type.
function topLevelKeys(body: string): string[] {
  const inner = body.slice(1, -1);
  const keys: string[] = [];
  let depth = 0;
  let atMemberStart = true;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i]!;
    if ("{[(<".includes(c)) { depth++; continue; }
    if ("}])>".includes(c)) { depth--; continue; }
    if (depth !== 0) { if (c === ";" || c === ",") atMemberStart = false; continue; }
    if (c === ";" || c === ",") { atMemberStart = true; continue; }
    if (/\s/.test(c)) continue;
    if (atMemberStart) {
      const rest = inner.slice(i);
      // String-built: a raw-quote regex literal confuses lint-imports.mjs.
      const keyRe = new RegExp("^(?:readonly\\s+)?(?:\"([^\"]+)\"|'([^']+)'|(\\w+))\\s*\\??\\s*:");
      const m = keyRe.exec(rest);
      if (m) {
        keys.push((m[1] ?? m[2] ?? m[3])!);
        atMemberStart = false;
        i += m[0].length - 1;
        continue;
      }
      atMemberStart = false;
    }
  }
  return keys;
}

// `type X = { ... };` (object literal only) or `interface X { ... }`, filtered
// to names matching `suffixRe`.
function declarationsIn(src: string, file: string, suffixRe: RegExp): Candidate[] {
  const out: Candidate[] = [];

  const typeRe = /(?:^|\n)[ \t]*(?:export\s+)?type\s+(\w+)\s*=\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = typeRe.exec(src))) {
    if (!suffixRe.test(m[1]!)) continue;
    const start = typeRe.lastIndex - 1;
    let depth = 0, i = start;
    for (; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") { depth--; if (depth === 0) { i++; break; } }
    }
    out.push({ name: m[1]!, file, line: lineOf(src, m.index), keys: topLevelKeys(src.slice(start, i)) });
  }

  const ifaceRe = /(?:^|\n)[ \t]*(?:export\s+)?interface\s+(\w+)(?:<[^{]*>)?\s*\{/g;
  while ((m = ifaceRe.exec(src))) {
    if (!suffixRe.test(m[1]!)) continue;
    const start = ifaceRe.lastIndex - 1;
    let depth = 0, i = start;
    for (; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") { depth--; if (depth === 0) { i++; break; } }
    }
    out.push({ name: m[1]!, file, line: lineOf(src, m.index), keys: topLevelKeys(src.slice(start, i)) });
  }

  return out;
}

// `import * as alias from "#db/<feature>/repo.ts"` -> alias -> feature path.
function repoImports(src: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = new RegExp(
    "import\\s+\\*\\s+as\\s+(\\w+)\\s+from\\s+[\"']#db\\/([^\"']+)\\/repo\\.ts[\"']", "g"
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.set(m[1]!, m[2]!);
  return out;
}

const tableColumnsCache = new Map<string, string[] | null>();

function columnsOfTable(table: string): string[] | null {
  if (tableColumnsCache.has(table)) return tableColumnsCache.get(table)!;
  const [schema, tableName] = table.split(".");
  if (!schema || !tableName) { tableColumnsCache.set(table, null); return null; }
  const file = path.join(CONTRACTS_ROOT, schema, `${tableName}.ts`);
  if (!existsSync(file)) { tableColumnsCache.set(table, null); return null; }
  const src = readFileSync(file, "utf8");
  // THE ENTITY'S NAME IS ITS EXPORT, so match the region's own object rather
  // than a fixed identifier: it was `Row` for a day and is `Rate`/`Order`/...
  // now, and a fixed name silently matched nothing - which this script's
  // "SCAN IS BROKEN" floor is what caught.
  const a = src.indexOf("// generated:start");
  const b = src.indexOf("// generated:end");
  const region = a === -1 || b === -1 ? src : src.slice(a, b);
  const m = /export const \w+ = z\.object\(\{([\s\S]*?)\n\}\);/.exec(region);
  if (!m) { tableColumnsCache.set(table, null); return null; }
  const cols = [...m[1]!.matchAll(/"(\w+)":/g)].map((x) => x[1]!);
  tableColumnsCache.set(table, cols);
  return cols;
}

const tableOfRepoCache = new Map<string, string | null>();

// A repo's own `buildUpdate({table: ...})` and its `sql/create.sql`'s
// `INSERT INTO` should name the same table - either answers the question.
function tableOfRepo(featurePath: string): string | null {
  if (tableOfRepoCache.has(featurePath)) return tableOfRepoCache.get(featurePath)!;
  const dir = path.join(DB_ROOT, featurePath);
  const repoFile = path.join(dir, "repo.ts");
  let table: string | null = null;
  if (existsSync(repoFile)) {
    const src = readFileSync(repoFile, "utf8");
    const buRe = new RegExp("buildUpdate\\(\\{\\s*\\n?\\s*table:\\s*[\"']([\\w.]+)[\"']");
    const bu = buRe.exec(src);
    if (bu) table = bu[1]!;
  }
  const createSql = path.join(dir, "sql", "create.sql");
  if (existsSync(createSql)) {
    const ins = /INSERT INTO\s+([\w.]+)/i.exec(readFileSync(createSql, "utf8"));
    if (ins) table = table ?? ins[1]!;
  }
  tableOfRepoCache.set(featurePath, table);
  return table;
}

// Every function in `src` whose parameter list names `typeName`, as
// `[bodyStart, bodyEnd)` spans. Not a TypeScript parse, deliberately.
function functionBodiesTaking(src: string, typeName: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const sig = /function\s+\w*\s*\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  const wanted = new RegExp(`\\b${typeName}\\b`);
  while ((m = sig.exec(src))) {
    if (!wanted.test(m[1]!)) continue;
    const openBrace = src.indexOf("{", sig.lastIndex);
    if (openBrace === -1) continue;
    let depth = 0, i = openBrace;
    for (; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") { depth--; if (depth === 0) { i++; break; } }
    }
    spans.push([openBrace, i]);
  }
  return spans;
}

// The union of columns every repo.create/update/createMany call inside these
// spans can reach.
function reachableColumns(
  spans: Array<[number, number]>, src: string, aliases: Map<string, string>
): Set<string> {
  const out = new Set<string>();
  for (const [start, end] of spans) {
    const body = src.slice(start, end);
    for (const [alias, featurePath] of aliases) {
      const re = new RegExp(`\\b${alias}\\.(?:create|update|createMany)\\(`);
      if (!re.test(body)) continue;
      const table = tableOfRepo(featurePath);
      if (!table) continue;
      const cols = columnsOfTable(table);
      if (!cols) continue;
      for (const c of cols) out.add(c);
    }
  }
  return out;
}

function checkInputShapes(lines: string[]): { findings: number; inScope: number; scanned: number } {
  const files = walk(DOMAIN_ROOT);
  const suffix = /(Create|New|Patch|Input|Body)$/;
  let findings = 0, inScope = 0;

  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const candidates = declarationsIn(src, path.relative(ROOT, file), suffix);
    if (candidates.length === 0) continue;
    const aliases = repoImports(src);

    for (const cand of candidates) {
      const spans = functionBodiesTaking(src, cand.name);
      const reachable = reachableColumns(spans, src, aliases);
      if (reachable.size === 0) continue; // no db write reached - out of scope
      inScope += 1;

      for (const key of cand.keys) {
        if (reachable.has(key)) continue;
        const acceptKey = `${cand.name}.${key}`;
        if (ACCEPTED[acceptKey]) { acceptedHit.add(acceptKey); continue; }
        findings += 1;
        lines.push(`  UNMATCHED  ${cand.name}.${key}  (${cand.file}:${cand.line})`);
      }
    }
  }
  return { findings, inScope, scanned: files.length };
}

// A builder's options are a contract's New/Patch type (or Partial<> of it) -
// a local `type XOptions` existing at all is the violation.
function checkBuilderOptions(lines: string[]): { findings: number; scanned: number } {
  const files = walk(BUILDERS_ROOT);
  const suffix = /Options$/;
  let findings = 0;

  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const cand of declarationsIn(src, path.relative(ROOT, file), suffix)) {
      const acceptKey = `Options:${cand.name}`;
      if (ACCEPTED[acceptKey]) { acceptedHit.add(acceptKey); continue; }
      findings += 1;
      lines.push(
        `  LOCAL OPTIONS TYPE  ${cand.name}  (${cand.file}:${cand.line}) - ` +
          `use a contract's New/Patch type or Partial<> of it`
      );
    }
  }
  return { findings, scanned: files.length };
}

if (process.argv.includes("--self-test")) {
  const { selfTest } = await import("./lib/self-test-harness.ts");
  const genTable = '// generated:start\nimport { z } from "zod/v4";\n' +
    'export const Shipment = z.object({\n' +
    '  "id": z.string().uuid(),\n' +
    '  "direction": z.string(),\n' +
    '});\n' +
    'export type Shipment = z.infer<typeof Shipment>;\n// generated:end\n';
  const repoFile =
    'export async function create(row: unknown, executor?: unknown) {\n' +
    '  return null;\n' +
    '}\n';
  const createSql = 'INSERT INTO shipping.shipments (id, direction)\nVALUES ($1, $2)\n' +
    'RETURNING id, direction\n';
  // A name distinct from the real ACCEPTED entries (which excuse the real
  // ShipmentCreate.order_id/.type) - otherwise this would plant a violation
  // the live map already forgives, proving nothing.
  const badService =
    'type TestingShipmentCreate = { smuggled_id?: string | null; type?: string | null };\n' +
    'export async function create(input: TestingShipmentCreate, executor?: unknown) {\n' +
    '  return await shipments.create({ id: "x", direction: input.type }, executor);\n' +
    '}\n' +
    'import * as shipments from "#db/shipping/shipments/repo.ts";\n';
  const goodService =
    'type TestingShipmentCreate = { direction?: string | null };\n' +
    'export async function create(input: TestingShipmentCreate, executor?: unknown) {\n' +
    '  return await shipments.create({ id: "x", direction: input.direction }, executor);\n' +
    '}\n' +
    'import * as shipments from "#db/shipping/shipments/repo.ts";\n';
  const fixture = (service: string) => ({
    "api/domain/shipping/shipments/service.ts": service,
    "api/db/shipping/shipments/repo.ts": repoFile,
    "api/db/shipping/shipments/sql/create.sql": createSql,
    "packages/contracts/src/shipping/shipments.ts": genTable,
  });
  await selfTest({
    script: new URL(import.meta.url).pathname,
    cases: [
      { name: "a ShipmentCreate-style stray field is seen", expect: "fail",
        rootEnv: "LINT_INPUT_SHAPES_ROOT", files: fixture(badService),
        mustPrint: "TestingShipmentCreate.smuggled_id" },
      { name: "a shape with only reachable columns passes", expect: "pass",
        rootEnv: "LINT_INPUT_SHAPES_ROOT", files: fixture(goodService),
        mustPrint: "0 unaccepted" },
      { name: "a type with no repo write is out of scope, not a finding", expect: "pass",
        rootEnv: "LINT_INPUT_SHAPES_ROOT",
        files: {
          "api/domain/rates/service.ts":
            'type RatesInput = { anything: string; nothingToDoWithADatabase: number };\n' +
            'export function quote(input: RatesInput) { return input.anything; }\n',
        },
        mustPrint: "0 unaccepted" },
      { name: "a local builder Options type is seen", expect: "fail",
        rootEnv: "LINT_INPUT_SHAPES_ROOT",
        files: {
          "api/shared/testing/builders/widgets.ts":
            'export type WidgetOptions = { name?: string };\n' +
            'export function aWidget(o: WidgetOptions = {}) { return o; }\n',
        },
        mustPrint: "WidgetOptions" },
    ],
  });
}

const lines: string[] = [];
const { findings: shapeFindings, inScope, scanned: domainScanned } = checkInputShapes(lines);
const { findings: optionsFindings, scanned: buildersScanned } = checkBuilderOptions(lines);
const findings = shapeFindings + optionsFindings;

console.log(
  `${domainScanned} domain file(s) scanned, ${inScope} write-facing input shape(s) checked; ` +
    `${buildersScanned} builder file(s) scanned`
);
for (const l of lines) console.log(l);
console.log(`\n${findings} unaccepted finding(s), ${acceptedHit.size} accepted`);
for (const [key, why] of Object.entries(ACCEPTED)) {
  if (acceptedHit.has(key)) console.log(`  accepted  ${key}\n            ${why}`);
}

// THE FLOOR. Skipped under a synthetic root: a self-test tree legitimately
// scans zero in-scope shapes, and that is the case being proven.
if ((domainScanned === 0 || inScope === 0) && !process.env.LINT_INPUT_SHAPES_ROOT) {
  console.error("\nSCAN IS BROKEN: no domain files or no write-facing input shapes found");
  process.exit(1);
}

const stale = Object.keys(ACCEPTED).filter((k) => !acceptedHit.has(k));
if (stale.length && !process.env.LINT_INPUT_SHAPES_ROOT) {
  console.error(`\n${stale.length} ACCEPTED entr(y/ies) matched nothing: ${stale.join(", ")}`);
  console.error("remove them - the field or the shape they excuse is gone");
  process.exit(1);
}

if (findings) process.exit(1);
