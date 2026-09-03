// Nothing irreversible goes inside a transaction — a rollback can't undo an email, a Stripe charge, or a FedEx label. Real incident: sendOrderToSupplier emailed a refiner before the transaction that recorded the order failed, so metal shipped against nothing.
// Source-level floor, not exhaustive — a new external call needs adding to EXTERNAL below.
import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Walks all three layer roots (db/domain/transport) so a repo or http handler opening a transaction directly is still seen, not just domain/ where most live.
const FEATURES = path.join(import.meta.dirname, "..", "..", "..");
const LAYER_ROOTS = ["db", "domain", "transport"].map((l) => path.join(FEATURES, l));
const walkAll = (): string[] => LAYER_ROOTS.flatMap((r) => walk(r));

// The irreversible things this codebase actually does.
const EXTERNAL = [
  { name: "email", pattern: /\bsendEmail\(|\bemailService\.\w+\(/ },
  { name: "stripe", pattern: /\bstripeClient\.\w+|\bstripe\.(charges|paymentIntents|refunds)\b/ },
  { name: "carrier", pattern: /\bprovider\.\w+\(|\bfedex\w*\.\w+\(/ },
  { name: "http", pattern: /\baxios\.\w+\(|(?<![.\w])fetch\(/ },
];

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    // Must match .ts as well as .js — matching only .js let every file converted to TypeScript silently escape this guard (down to 3 of 25 real files at one point).
    // Caught only by its own floor (`withTx.length > 3`) — narrowing the extension list again would slip past silently.
    else if (/\.(js|ts)$/.test(e.name) && !e.name.includes(".test.")) out.push(full);
  }
  return out;
};

// Brace counting rather than a parser: withTransaction takes a callback, and
// the block ends when the braces opened by that call close again.
function sideEffectsInTransactions(file: string): string[] {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const hits: string[] = [];
  let depth = 0;
  let openedAt = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (depth === 0) {
      if (/withTransaction\(/.test(line)) {
        depth = 1;
        openedAt = i + 1;
      }
      continue;
    }

    depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
    if (depth <= 0) {
      depth = 0;
      continue;
    }
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;

    for (const { name, pattern } of EXTERNAL) {
      if (pattern.test(line)) {
        hits.push(
          `${path.relative(FEATURES, file)}:${i + 1} sends ${name} inside the ` +
            `transaction opened at line ${openedAt} - ${line.trim()}`
        );
      }
    }
  }
  return hits;
}

test("there are transactions to check", () => {
  const withTx = walkAll().filter((f) =>
    /withTransaction\(/.test(fs.readFileSync(f, "utf8"))
  );
  assert.ok(
    // Floor is 15: below today's 25 (deleting a dual repo shouldn't fail this), but high enough that losing .ts coverage again would.
    withTx.length > 15,
    `only ${withTx.length} files use withTransaction - the walk is probably wrong`
  );
});

test("no irreversible side effect happens inside a transaction", () => {
  const hits = walkAll().flatMap(sideEffectsInTransactions);
  assert.deepEqual(
    hits,
    [],
    "a transaction can be rolled back; an email, a charge and a shipping label cannot. " +
      "Do the database work first, commit, then act on the outside world."
  );
});
