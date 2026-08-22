// Static checks for the two ways a call to the shared query executor has
// actually gone wrong in this repo. Both are mechanical, so they are checked
// mechanically rather than left to review.
//
//   1. Executor passed in the params slot.
//        query(sql, client)            <- client lands in `params`
//      pg then rejects with "Query values must be an array". This shipped and
//      broke checkout: a rolled-back sell-cart sync left scrap rows unwritten,
//      so order creation hit a foreign key violation.
//
//   2. Direct use of pool.query, which bypasses the shared executor. Those
//      calls cannot be handed a client, so they can never join a caller's
//      transaction - the reason several multi-step operations were not atomic.
//
//   3. A query that is never awaited.
//        const result = query(sql, values)   <- result is a Promise
//      result.rows is undefined, so the next line throws reading '0'. Silent
//      for months behind a swallowed catch.
//
// Run: pnpm --filter @dorado/api lint:db
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

function sourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (entry.name.endsWith(".js") || entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

// Splits the argument list of a call whose opening paren is at `open`,
// respecting nesting, strings and template literals.
function callArgs(src, open) {
  const args = [];
  let depth = 1;
  let cur = "";
  let i = open + 1;

  for (; i < src.length && depth > 0; i++) {
    const c = src[i];

    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\") j++;
        j++;
      }
      cur += src.slice(i, j + 1);
      i = j;
      continue;
    }

    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (depth === 0) break;
    }

    if (depth === 1 && c === ",") {
      args.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }

  args.push(cur);
  return { args: args.map((a) => a.trim()), end: i };
}

const lineOf = (src, index) => src.slice(0, index).split("\n").length;

const problems = [];

for (const file of sourceFiles(path.join(ROOT, "features"))) {
  const src = fs.readFileSync(file, "utf8");
  const rel = path.relative(ROOT, file);
  // Direct pool.query bypasses the shared executor entirely.
  for (const m of src.matchAll(/\bpool\.query\(/g)) {
    problems.push(
      `${rel}:${lineOf(src, m.index)}  pool.query bypasses the shared executor - use query(sql, params, client)`
    );
  }

  const re = /\bquery\(/g;
  let m;

  while ((m = re.exec(src))) {
    // Skip property access such as client.query( or pool.query(.
    if (src[m.index - 1] === ".") continue;
    // Skip the declaration of the executor itself.
    if (/function\s+$/.test(src.slice(0, m.index))) continue;

    const open = m.index + "query".length;
    const { args } = callArgs(src, open);
    const line = lineOf(src, m.index);

    if (args.length === 2 && /^(client|executor)$/.test(args[1])) {
      problems.push(
        `${rel}:${line}  executor passed as params - use query(sql, [], ${args[1]})`
      );
    }

    const before = src.slice(0, m.index).trimEnd();
    const awaited = /\bawait$/.test(before);
    const returned = /\breturn$/.test(before);
    if (!awaited && !returned) {
      problems.push(`${rel}:${line}  query() result is never awaited`);
    }
  }
}

if (problems.length) {
  console.error(`db call check failed (${problems.length}):\n`);
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}

console.log("db call check passed");
