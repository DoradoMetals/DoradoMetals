import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOTS = [
  path.resolve(process.cwd(), "..", "frontend"),
  path.resolve(process.cwd(), "..", "packages", "client", "src"),
];

const CONTEXT = /\b(mutationFn|queryFn|request|onSuccess|onSettled|onError|onMutate)\s*:/g;

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      e.name === "node_modules" || e.name === ".next" || e.name.startsWith(".") ||
      e.name === "tests"
    ) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name)) out.push(full);
  }
  return out;
};

const ALLOWED: string[] = [
  "(top level) GET /products",
];

test("only the two order emails are triggered after an operation already succeeded", () => {
  const found: string[] = [];
  const all: string[] = [];
  let total = 0;

  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const src = fs.readFileSync(file, "utf8");
      const keys: [number, string][] = [...src.matchAll(CONTEXT)].map((m) => [m.index, m[1]]);
      for (const m of src.matchAll(
        /apiRequest(?:<[^>]*>)?\(\s*['"](GET|POST|PUT|DELETE|PATCH)['"],\s*(?:'([^']+)'|"([^"]+)"|`([^`]+)`)/g
      )) {
        total += 1;
        const prior = keys.filter(([at]) => at < m.index);
        const ctx = prior.length ? prior[prior.length - 1][1] : "(top level)";
        const entry = `${ctx} ${m[1]} ${m[2] ?? m[3] ?? m[4]}`;
        all.push(entry);
        if (ctx === "mutationFn" || ctx === "queryFn" || ctx === "request") continue;
        found.push(entry);
      }
    }
  }

  assert.ok(
    all.includes("queryFn GET /spots"),
    "packages/client/src was not scanned - the known /spots queryFn call is missing"
  );

  assert.ok(
    total >= 95,
    `only ${total} apiRequest call(s) found - the scan has stopped matching, ` +
      "and a check that reads nothing accepts everything"
  );

  assert.deepEqual(
    found.sort(),
    [...ALLOWED].sort(),
    "an API call runs after its operation has already succeeded. If it fails " +
      "the user still sees success, nothing retries, and nobody is told - " +
      "which is exactly how the offer-accepted email went missing. Either move " +
      "it into the mutationFn, send it from the server, or add it here on purpose."
  );
  console.log(`      ${total} apiRequest call(s) scanned, ${found.length} outside a mutationFn`);
});
