// EVERY CONTRACT FIELD TRACES TO A COLUMN.
//
// The contracts package is one file per database entity: a GENERATED REGION
// holding the table's `Row`, and below it hand-written derivations - `New`,
// `Patch`, the named reads - each a .pick()/.omit()/.extend() of a Row. The
// point of that shape is drift detection: a column added, dropped or made
// nullable moves the Row, which moves every derivation built on it, and the
// build says so.
//
// A HAND-WRITTEN FIELD LIST DEFEATS ALL OF IT, and silently. `z.object({ id:
// z.string().uuid(), quantity: z.number() })` compiles forever, describes a
// table it is not attached to, and goes on describing it after the column it
// was copied from changes type. That is how the old wire/products.ts came to
// declare `variant_label: z.string().nullable()` against a NOT NULL column,
// and how five patch bodies came to advertise a `null` the API could not
// accept.
//
// SO: outside a generated region, a `z.object(...)` / `z.looseObject(...)` may
// COMPOSE schemas and may not DECLARE fields. A property whose value is
// `Row.shape.id`, `Write.optional()`, `z.array(Line)` is a reference and is
// fine. A property whose value contains a bare zod leaf - `z.string()`,
// `z.number().optional()`, `z.enum([...])` - is a hand-written column and
// fails. Genuinely new data goes through `.extend()`, which is not scanned:
// there it reads as an addition to a row rather than as a table of its own.
//
// `src/computed/` is the one exception - the quote surface's arithmetic and
// the carrier catalogue the provider adapter assembles, neither of which any
// table backs. It is PINNED FROM BOTH SIDES: an undeclared file there fails,
// and a declared file that no longer needs the exception fails too, so the
// list can only shrink.
//
//   pnpm --filter @dorado/api lint:contracts-derived
//   pnpm --filter @dorado/api lint:contracts-derived --self-test
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.LINT_CONTRACTS_ROOT
  ? path.resolve(process.env.LINT_CONTRACTS_ROOT)
  : path.resolve(import.meta.dirname, "..", "..", "packages", "contracts", "src");

const START = "// generated:start";
const END = "// generated:end";

// Files that may declare their own fields, each with the reason no Row exists
// to derive from. Pinned from both sides below.
const COMPUTED: Record<string, string> = {
  "computed/quotes.ts": "priced arithmetic, returned and never stored",
  "computed/providers.ts": "the carrier catalogue the provider adapter assembles",
};

// A walk that opens nothing is a lint that passes on everything.
const FILE_FLOOR = 60;

const walk = (dir: string, base = dir): string[] => {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full, base));
    else if (e.name.endsWith(".ts")) out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out.sort();
};

// The generated regions, blanked out so their offsets still line up with the
// original text and a reported line number is the real one.
const blankRegions = (text: string): string => {
  let out = "";
  let i = 0;
  for (;;) {
    const a = text.indexOf(START, i);
    if (a === -1) return out + text.slice(i);
    const b = text.indexOf(END, a);
    const stop = b === -1 ? text.length : b + END.length;
    out += text.slice(i, a) + text.slice(a, stop).replace(/[^\n]/g, " ");
    i = stop;
  }
};

// A bare zod leaf: the constructors that make a NEW field rather than reuse
// one. `z.object` and `z.looseObject` are not leaves - they are the thing
// being scanned - and `z.array`/`z.union`/`z.record` are containers, judged by
// what is inside them.
const LEAF =
  /\bz\.(string|number|boolean|bigint|date|symbol|literal|enum|nativeEnum|unknown|any|never|void|null|undefined|nan|file|coerce|instanceof|custom|iso|uuid|email|url|int32|int64|float32|float64|stringbool)\b/;

type Finding = { file: string; line: number; field: string; text: string };

// Splits an object literal's top level into `key: value` pairs. Depth-aware so
// a nested object, array or call does not end a property early, and
// string-aware so a brace inside a literal does not either.
function properties(src: string, open: number): { props: { key: string; value: string }[]; end: number } | null {
  let depth = 0;
  let i = open;
  let quote: string | null = null;
  const parts: string[] = [];
  let cur = "";
  for (; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === "\\") { cur += ch + (src[i + 1] ?? ""); i++; continue; }
      if (ch === quote) quote = null;
      cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; cur += ch; continue; }
    if (ch === "{" || ch === "(" || ch === "[") {
      depth++;
      if (depth === 1 && ch === "{") continue;
      cur += ch;
      continue;
    }
    if (ch === "}" || ch === ")" || ch === "]") {
      depth--;
      if (depth === 0) { parts.push(cur); break; }
      cur += ch;
      continue;
    }
    if (ch === "," && depth === 1) { parts.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (depth !== 0) return null;
  const props: { key: string; value: string }[] = [];
  for (const raw of parts) {
    // Comments carry prose that can contain anything; drop them before the
    // key/value split so a `//` mentioning z.string() is not a finding.
    const p = raw.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
    if (!p) continue;
    const c = p.indexOf(":");
    if (c === -1) { props.push({ key: p, value: p }); continue; }
    props.push({ key: p.slice(0, c).trim(), value: p.slice(c + 1).trim() });
  }
  return { props, end: i };
}

function scan(file: string, text: string): Finding[] {
  const found: Finding[] = [];
  const src = blankRegions(text);
  const re = /\bz\.(object|looseObject)\s*\(\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const open = src.indexOf("{", m.index + m[0].length - 1);
    const parsed = properties(src, open);
    if (!parsed) continue;
    for (const { key, value } of parsed.props) {
      if (!LEAF.test(value)) continue;
      found.push({
        file,
        line: src.slice(0, open).split("\n").length,
        field: key,
        text: value.replace(/\s+/g, " ").slice(0, 70),
      });
    }
  }
  return found;
}

if (process.argv.includes("--self-test")) {
  const { selfTest } = await import("./lib/self-test-harness.ts");
  const region = (body: string) =>
    `${START}\nimport { z } from "zod/v4";\n\nexport const Row = z.object({\n  "id": z.string().uuid(),\n  "qty": z.number(),\n});\nexport type Row = z.infer<typeof Row>;\n${END}\n${body}`;
  // The floor would refuse a two-file tree, so every case ships a filler set.
  const filler: Record<string, string> = {};
  for (let i = 0; i < FILE_FLOOR; i++) filler[`filler/t${i}.ts`] = region("");
  // COMPUTED is pinned from both sides, so every synthetic tree has to carry
  // its declared members - and each has to keep declaring a field of its own,
  // which is the condition the other side of the pin checks.
  for (const rel of Object.keys(COMPUTED)) {
    filler[rel] = `import { z } from "zod/v4";\nexport const X = z.object({ a: z.string() });\n`;
  }
  await selfTest({
    script: import.meta.filename,
    cases: [
      {
        name: "a hand-written field list outside the region is seen",
        rootEnv: "LINT_CONTRACTS_ROOT",
        files: { ...filler, "orders/items.ts": region(`export const Bad = z.object({ id: z.string().uuid(), qty: z.number() });`) },
        expect: "fail",
        mustPrint: "declares its own field",
      },
      {
        name: "the same fields composed from the Row pass",
        rootEnv: "LINT_CONTRACTS_ROOT",
        files: { ...filler, "orders/items.ts": region(`export const Good = z.object({ id: Row.shape.id, qty: Row.shape.qty });`) },
        expect: "pass",
        mustPrint: "derive from a row",
      },
      {
        name: "the SAME literal inside the generated region is left alone",
        rootEnv: "LINT_CONTRACTS_ROOT",
        files: { ...filler, "orders/items.ts": region("") },
        expect: "pass",
      },
      {
        name: "a leaf reached through .extend() is allowed",
        rootEnv: "LINT_CONTRACTS_ROOT",
        files: { ...filler, "orders/items.ts": region(`export const Ok = Row.pick({ id: true }).extend({ weight: z.number() });`) },
        expect: "pass",
      },
      {
        name: "an undeclared file under computed/ fails",
        rootEnv: "LINT_CONTRACTS_ROOT",
        files: { ...filler, "computed/invented.ts": `import { z } from "zod/v4";\nexport const X = z.object({ a: z.string() });\n` },
        expect: "fail",
        mustPrint: "not declared",
      },
      {
        name: "a walk that opens too few files fails rather than reporting clean",
        rootEnv: "LINT_CONTRACTS_ROOT",
        files: { "orders/items.ts": region("") },
        expect: "fail",
        mustPrint: "floor",
      },
    ],
  });
}

const files = walk(ROOT);
if (files.length < FILE_FLOOR) {
  console.error(
    `only ${files.length} contract file(s) walked, floor is ${FILE_FLOOR} - a lint that ` +
      `opens nothing passes everything, so this is a broken walk, not a clean tree.`
  );
  process.exit(1);
}

const findings: Finding[] = [];
const seenComputed = new Set<string>();

for (const rel of files) {
  const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
  if (rel.startsWith("computed/")) {
    if (!(rel in COMPUTED)) {
      console.error(`${rel}: under computed/ but not declared in this script's COMPUTED map.`);
      console.error("  A shape no table backs needs a reason recorded beside it, not a directory to hide in.");
      process.exit(1);
    }
    seenComputed.add(rel);
    // Pinned from the other side too: a declared file that has stopped
    // declaring its own fields no longer needs the exception.
    if (!scan(rel, text).length) {
      console.error(`${rel}: declared in COMPUTED but derives from rows now - drop the entry.`);
      process.exit(1);
    }
    continue;
  }
  findings.push(...scan(rel, text));
}

for (const rel of Object.keys(COMPUTED)) {
  if (seenComputed.has(rel)) continue;
  console.error(`${rel}: declared in COMPUTED but no such file - an exclusion that outlives its subject excuses the next one.`);
  process.exit(1);
}

console.log(`${files.length} contract file(s) walked, ${Object.keys(COMPUTED).length} computed exception(s)`);
if (findings.length) {
  console.log();
  for (const f of findings) {
    console.log(`  ${f.file}:${f.line}  \`${f.field}\` declares its own field: ${f.text}`);
  }
  console.log(
    `\n${findings.length} hand-written field(s). Compose from the entity's Row - ` +
      `\`Row.shape.<column>\` - or, for data no column holds, add it through .extend().`
  );
  process.exit(1);
}
console.log("every hand-written shape composes schemas that derive from a row");
