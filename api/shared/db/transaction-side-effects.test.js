// Nothing irreversible inside a transaction.
//
// A database transaction can be rolled back. An email cannot, a Stripe charge
// cannot, and a FedEx label cannot. Putting one inside a withTransaction block
// means that if a later statement fails, the outside world has already acted on
// something the database then forgets.
//
// sendOrderToSupplier did exactly this: it emailed the refiner their copy of a
// sales order, with the invoice attached, as the first statement of a
// transaction that went on to attach the supplier, create the outbound shipment
// and mark the order sent. A failure in any of those three rolled back the
// record and left the refiner shipping metal to a customer against an order
// nothing in the system knew had been sent.
//
// This is a source check with no database behind it, in the same spirit as
// switch-surface.test.js. It is a floor - it knows the names of the external
// calls this codebase makes today, not every possible one - so a new provider
// wants adding to EXTERNAL below.
//
// Proved before being trusted: run against the commit before the fix it reports
// features/sales-orders/service.js:181, and zero afterwards.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const FEATURES = path.join(import.meta.dirname, "..", "..", "features");

// The irreversible things this codebase actually does.
const EXTERNAL = [
  { name: "email", pattern: /\bsendEmail\(|\bemailService\.\w+\(/ },
  { name: "stripe", pattern: /\bstripeClient\.\w+|\bstripe\.(charges|paymentIntents|refunds)\b/ },
  { name: "carrier", pattern: /\bprovider\.\w+\(|\bfedex\w*\.\w+\(/ },
  { name: "http", pattern: /\baxios\.\w+\(|(?<![.\w])fetch\(/ },
];

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith(".js") && !e.name.includes(".test.")) out.push(full);
  }
  return out;
};

// Brace counting rather than a parser: withTransaction takes a callback, and
// the block ends when the braces opened by that call close again.
function sideEffectsInTransactions(file) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const hits = [];
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
  const withTx = walk(FEATURES).filter((f) =>
    /withTransaction\(/.test(fs.readFileSync(f, "utf8"))
  );
  assert.ok(
    withTx.length > 3,
    `only ${withTx.length} files use withTransaction - the walk is probably wrong`
  );
});

test("no irreversible side effect happens inside a transaction", () => {
  const hits = walk(FEATURES).flatMap(sideEffectsInTransactions);
  assert.deepEqual(
    hits,
    [],
    "a transaction can be rolled back; an email, a charge and a shipping label cannot. " +
      "Do the database work first, commit, then act on the outside world."
  );
});
