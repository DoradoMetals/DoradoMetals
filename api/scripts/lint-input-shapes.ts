import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.env.LINT_INPUT_SHAPES_ROOT
  ?? path.resolve(import.meta.dirname, "..", "..");
const DOMAIN_ROOT = path.join(ROOT, "api", "domain");
const DB_ROOT = path.join(ROOT, "api", "db");
const BUILDERS_ROOT = path.join(ROOT, "api", "shared", "testing", "builders");
const CONTRACTS_ROOT = path.join(ROOT, "packages", "contracts", "src");

const ACCEPTED: Record<string, string> = {
  "Options:CartOptions": "pre-existing (checkout.ts) - not this lane's file.",
  "Options:LotOptions": "pre-existing (checkout.ts/orders.ts) - not this lane's file.",
  "Options:OrderOptions": "pre-existing (orders.ts) - not this lane's file.",
  "Options:BullionOptions": "pre-existing (orders.ts) - not this lane's file.",
  "Options:AddressOptions":
    "places.ts - the builder writes two tables through two repos, so its options " +
    "are not one table's patch; the recipient and the nickname are the link's.",
  "Options:ShipmentOptions": "pre-existing (shipping.ts) - not this lane's file.",
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
      if (reachable.size === 0) continue;
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
  `${domainScanned} domain file(s) scanned, ${inScope} write-facing input shape(s) checked ` +
    `(zero is the goal - domain takes its write shapes from @dorado/contracts); ` +
    `${buildersScanned} builder file(s) scanned`
);
for (const l of lines) console.log(l);
console.log(`\n${findings} unaccepted finding(s), ${acceptedHit.size} accepted`);
for (const [key, why] of Object.entries(ACCEPTED)) {
  if (acceptedHit.has(key)) console.log(`  accepted  ${key}\n            ${why}`);
}

if (!process.env.LINT_INPUT_SHAPES_ROOT) {
  if (domainScanned === 0 || buildersScanned === 0) {
    console.error("\nSCAN IS BROKEN: the walk opened no domain or builder files");
    process.exit(1);
  }
  if (acceptedHit.size === 0) {
    console.error(
      "\nSCAN IS BROKEN: not one known shape was recognised - the detector, " +
        "not the codebase, is what changed"
    );
    process.exit(1);
  }
}

const stale = Object.keys(ACCEPTED).filter((k) => !acceptedHit.has(k));
if (stale.length && !process.env.LINT_INPUT_SHAPES_ROOT) {
  console.error(`\n${stale.length} ACCEPTED entr(y/ies) matched nothing: ${stale.join(", ")}`);
  console.error("remove them - the field or the shape they excuse is gone");
  process.exit(1);
}

if (findings) process.exit(1);
