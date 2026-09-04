import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.LINT_NS_ROOT
  ? path.resolve(process.env.LINT_NS_ROOT)
  : path.resolve(import.meta.dirname, "..");

if (process.argv.includes("--self-test")) {
  const { selfTest } = await import("./lib/self-test-harness.ts");
  const Q = String.fromCharCode(34);
  const base = {
    "package.json": JSON.stringify({ imports: { "#shared/*": "./shared/*", "#example/*": "./example/*" } }),
    "example/spots/service.js": "export function forOrder() {}\nexport const other = 1;\n",
  };
  const caller = (call) =>
    `import * as spots from ${Q}#example/spots/service.js${Q};\n${call}\n`;
  const LOW = { LINT_NS_FLOOR: "1" };
  await selfTest({
    script: import.meta.filename,
    cases: [
      {
        name: "a namespace call to a member that moved away is seen (D110)",
        rootEnv: "LINT_NS_ROOT", env: LOW,
        files: { ...base, "scripts/validate.mjs": caller("export const r = spots.getSpotsByOrder();") },
        expect: "fail", mustPrint: "not exported by",
      },
      {
        name: "scripts/ is inside the walk - the caller that hurt lived there",
        rootEnv: "LINT_NS_ROOT", env: LOW,
        files: { ...base, "scripts/only-here.mjs": caller("export const r = spots.vanished();") },
        expect: "fail", mustPrint: "scripts/only-here.mjs",
      },
      {
        name: "a member that does exist passes",
        rootEnv: "LINT_NS_ROOT", env: LOW,
        files: { ...base, "example/x/caller.js": caller("export const r = spots.forOrder();") },
        expect: "pass", mustPrint: "0 unresolved",
      },
      {
        name: "the floor itself fires on a tree far below it",
        rootEnv: "LINT_NS_ROOT",
        files: { ...base, "example/x/caller.js": caller("export const r = spots.forOrder();") },
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
    else if (/\.(js|ts|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function stripComments(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      while (i < n && src[i] !== "\n") { out += src[i] === "\n" ? "\n" : " "; i += 1; }
    } else if (c === "/" && next === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 2;
    } else if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c; i += 1;
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\") { out += src[i] + (src[i + 1] ?? ""); i += 2; continue; }
        out += src[i]; i += 1;
      }
      out += quote; i += 1;
    } else { out += c; i += 1; }
  }
  return out;
}

function blankStrings(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      while (i < n && src[i] !== "\n") { out += " "; i += 1; }
    } else if (c === "/" && next === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 2;
    } else if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += " "; i += 1;
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\") { out += "  "; i += 2; continue; }
        if (quote === "`" && src[i] === "$" && src[i + 1] === "{") {
          out += "${"; i += 2;
          let depth = 1;
          while (i < n && depth > 0) {
            if (src[i] === "{") depth += 1;
            else if (src[i] === "}") depth -= 1;
            out += src[i]; i += 1;
          }
          continue;
        }
        out += src[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      out += " "; i += 1;
    } else { out += c; i += 1; }
  }
  return out;
}

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

const exportsCache = new Map();

function exportsOf(file, seen = new Set()) {
  if (exportsCache.has(file)) return exportsCache.get(file);
  if (seen.has(file)) return new Set();
  seen.add(file);

  let src;
  try {
    src = stripComments(fs.readFileSync(file, "utf8"));
  } catch {
    return new Set();
  }

  const names = new Set();
  for (const m of src.matchAll(
    /\bexport\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g
  )) names.add(m[1]);

  for (const m of src.matchAll(/\bexport\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const piece = part.trim();
      if (!piece) continue;
      const as = piece.split(/\s+as\s+/);
      names.add((as[1] ?? as[0]).trim());
    }
  }

  for (const m of src.matchAll(/\bexport\s+(?:type|interface)\s+([A-Za-z_$][\w$]*)/g)) {
    names.delete(m[1]);
  }

  for (const m of src.matchAll(/\bexport\s*\*\s*from\s*["']([^"']+)["']/g)) {
    const target = m[1].startsWith("#")
      ? resolveSubpath(m[1])
      : path.resolve(path.dirname(file), m[1]);
    if (!target) continue;
    for (const cand of [target, target.replace(/\.js$/, ".ts"), target.replace(/\.ts$/, ".js")]) {
      if (fs.existsSync(cand)) {
        for (const n of exportsOf(cand, seen)) names.add(n);
        break;
      }
    }
  }

  exportsCache.set(file, names);
  return names;
}

const NAMESPACE_IMPORT = /import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s*from\s*["']([^"']+)["']/g;

const problems = [];
let checked = 0;

for (const file of sourceFiles(ROOT)) {
  const raw = fs.readFileSync(file, "utf8");
  const src = stripComments(raw);
  const calls = blankStrings(raw);

  for (const imp of src.matchAll(NAMESPACE_IMPORT)) {
    const [, alias, spec] = imp;
    if (!spec.startsWith("#") && !spec.startsWith(".")) continue;

    const resolved = spec.startsWith("#")
      ? resolveSubpath(spec)
      : path.resolve(path.dirname(file), spec);
    if (!resolved) continue;

    const target = [
      resolved.replace(/\.(js|ts)$/, ".d.ts"),
      resolved,
      resolved.replace(/\.js$/, ".ts"),
      resolved.replace(/\.ts$/, ".js"),
    ].find((c) => fs.existsSync(c));
    if (!target) continue;

    const available = exportsOf(target);
    if (available.size === 0) continue;

    const CALL = new RegExp(`\\b${alias}\\s*\\.\\s*([A-Za-z_$][\\w$]*)\\s*\\(`, "g");
    for (const call of calls.matchAll(CALL)) {
      const member = call[1];
      checked += 1;
      if (!available.has(member)) {
        problems.push({ file, alias, spec, member });
      }
    }
  }
}

const FLOOR = process.env.LINT_NS_ROOT ? Number(process.env.LINT_NS_FLOOR ?? 900) : 900;
if (checked < FLOOR) {
  console.error(
    `lint:namespace-calls checked only ${checked} namespace call(s), expected at least ` +
      `${FLOOR} - the walk is broken, not the codebase clean`
  );
  process.exit(1);
}

for (const p of problems) {
  console.log(
    `${path.relative(ROOT, p.file)}  ->  ${p.alias}.${p.member}()   not exported by ${p.spec}`
  );
}

console.log(`\n${checked} namespace call(s) checked, ${problems.length} unresolved`);
process.exit(problems.length ? 1 : 0);
