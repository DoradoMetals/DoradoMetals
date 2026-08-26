// Every `ns.member` reached through an `import * as ns` must actually exist on
// that module.
//
// WHY THIS EXISTS. features/payments/service.js awaited
// addressService.getAddressFromId for EIGHT MONTHS. Nothing defined it - it was
// lost in be03eed3, the December 2025 feature slicing - and
// POST /api/stripe/update_payment_intent answered 500 on every call as a
// result. That is the route that prices the cart and tells Stripe what to
// charge.
//
// `import * as ns` binds a namespace object. Reading a name that is not
// exported gives `undefined` rather than an error, in JavaScript AND in
// TypeScript when the target is untyped JavaScript. So nothing failed until the
// line ran, and only the route's own success path ran it.
//
// lint:imports proves a module PATH resolves. This proves the MEMBER does.
//
// SCOPE, deliberately narrow so it can be trusted:
//   - only `import * as ns from "..."` namespaces, because a named import is
//     already an error at load time if it does not exist
//   - only internal specifiers (relative and `#subpath`), because a package's
//     exports are its own business
//   - only members that are CALLED - `ns.fn(` - since a bare `ns.thing`
//     reference may legitimately be a re-export probe or a type position
//
// Run: pnpm --filter @dorado/api lint:namespace-calls
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
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

// The same scanner lint-imports.mjs uses, and for the same reason: `//` appears
// inside every https:// string in the repo, so a regex strip would truncate the
// line and hide real code after it. Commented-out calls are not calls.
// TWO passes over the source, because the two questions need different views.
//
// stripComments keeps string CONTENTS, and is what finds `import * as ns from
// "#features/x"` - the specifier is inside a string, so blanking it leaves
// nothing to resolve. That was the first version of this and it reported "no
// namespace calls at all", which the guard at the bottom caught rather than
// letting it pass clean.
//
// blankStrings additionally empties string contents, and is what finds the
// CALLS - see the note inside it.
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

// The call view. Same scanner, but string contents become spaces so that SQL
// cannot look like code.
//
// The first run reported three failures and all three were SQL:
// `INSERT INTO exchange.payment_intents (` inside a template literal, matching a
// namespace imported as `exchange`. A schema-qualified table followed by a paren
// is indistinguishable from a call unless the scanner knows it is in a string.
//
// `${...}` interpolations are KEPT, because real calls live in them.
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

// What a module exports, read from its source rather than by importing it -
// importing would run module-level code, open a pool and need an env.
//
// Covers: `export function f`, `export async function f`, `export const f`,
// `export class C`, `export { a, b as c }`, and `export * from "./x"` followed
// transitively. A default export is not a namespace member anyone calls as
// `ns.default(` here, so it is ignored.
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

  // `export { a, b as c }` - the EXPORTED name is what a caller reads, so `c`.
  for (const m of src.matchAll(/\bexport\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const piece = part.trim();
      if (!piece) continue;
      const as = piece.split(/\s+as\s+/);
      names.add((as[1] ?? as[0]).trim());
    }
  }

  // `export type X` / `export interface X` are type-only and cannot be called.
  for (const m of src.matchAll(/\bexport\s+(?:type|interface)\s+([A-Za-z_$][\w$]*)/g)) {
    names.delete(m[1]);
  }

  // `export * from "./sibling"` - follow it, or this reports a false positive
  // for a barrel.
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
  const src = stripComments(raw);   // specifiers live inside strings
  const calls = blankStrings(raw);  // SQL must not look like a call

  for (const imp of src.matchAll(NAMESPACE_IMPORT)) {
    const [, alias, spec] = imp;
    if (!spec.startsWith("#") && !spec.startsWith(".")) continue;

    const resolved = spec.startsWith("#")
      ? resolveSubpath(spec)
      : path.resolve(path.dirname(file), spec);
    if (!resolved) continue;

    // A declaration file is the authority on a JavaScript module's surface, so
    // prefer it where one exists.
    const target = [
      resolved.replace(/\.(js|ts)$/, ".d.ts"),
      resolved,
      resolved.replace(/\.js$/, ".ts"),
      resolved.replace(/\.ts$/, ".js"),
    ].find((c) => fs.existsSync(c));
    if (!target) continue; // lint:imports owns unresolved paths

    const available = exportsOf(target);
    if (available.size === 0) continue; // nothing parsed - say nothing

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

// A run that checked nothing is a broken run, not a clean one.
if (checked === 0) {
  console.error("lint:namespace-calls found no namespace calls at all - the walk is broken");
  process.exit(1);
}

for (const p of problems) {
  console.log(
    `${path.relative(ROOT, p.file)}  ->  ${p.alias}.${p.member}()   not exported by ${p.spec}`
  );
}

console.log(`\n${checked} namespace call(s) checked, ${problems.length} unresolved`);
process.exit(problems.length ? 1 : 0);
