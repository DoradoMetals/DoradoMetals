// Tests that can pass while asserting nothing.
//
// WHY THIS EXISTS. features/shipping/shipments/tests/service.test.js opened
// every one of its seven tests with
//
//     const orderId = await anOrderWithoutShipment(c);
//     if (!orderId) return;
//
// and dev held zero orders matching that search - so all seven returned on the
// second line and reported success, for as long as the file had existed.
// Making the fixture BUILD its order instead found three real defects in the
// shipments restructure within a minute.
//
// Nothing else could have caught it. The suite was green, the lints were green,
// and a coverage tool would have said the file ran.
//
// TWO SHAPES ARE REPORTED, and they are different risks:
//
//   SKIP  - the test returns early when a fixture finds nothing. Legitimate
//           when dev genuinely may not hold the case, and a silent no-op when
//           dev NEVER holds it. This cannot tell the two apart on its own, so
//           it reports them for a human to check against the database. What it
//           CAN say is whether the file makes the skip visible.
//
//   LOOP  - the test iterates a query result and asserts inside the loop, with
//           nothing asserting the result is non-empty. `for (const x of [])`
//           runs zero times and passes. This one is nearly always a real gap,
//           because the fix costs one line.
//
// A skip is EXEMPT when the test asserts the fixture found something before
// returning, or when the return carries a comment explaining what dev may
// legitimately lack - both are the author saying "I checked".
//
// Static. Reads the files, needs no database.
//
//   pnpm --filter @dorado/api audit:vacuous-tests
//   pnpm --filter @dorado/api audit:vacuous-tests --self-test
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const SELF_TEST = process.argv.includes("--self-test");

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : walk(p);
    return /\.test\.(js|ts)$/.test(e.name) ? [p] : [];
  });

// The body of each `test("name", ...)` in a file, with the line it starts on.
// Brace-counted rather than regexed to the end, because a test body contains
// braces and a lazy match would stop at the first one.
function tests(source) {
  const out = [];
  const opener = /\btest\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
  let m;
  while ((m = opener.exec(source)) !== null) {
    const name = m[2];
    const startLine = source.slice(0, m.index).split("\n").length;

    // Walk from the opening paren to its match, ignoring braces in strings and
    // comments well enough for this purpose.
    let depth = 0;
    let i = source.indexOf("(", m.index);
    const from = i;
    for (; i < source.length; i++) {
      const ch = source[i];
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push({ name, startLine, body: source.slice(from, i + 1) });
  }
  return out;
}

const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const findings = [];

const files = walk(path.join(ROOT, "features")).concat(walk(path.join(ROOT, "shared")));

// THE FLOOR. A walker that stops finding files reports a clean sweep, which is
// the failure mode this whole script exists to prevent.
if (!SELF_TEST && files.length < 60) {
  console.error(`only ${files.length} test file(s) found - the walk is broken`);
  process.exit(1);
}

let scanned = 0;

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const rel = path.relative(ROOT, file);
  const whole = stripComments(source);

  // Literal arrays declared at MODULE scope count too. features/media/pdfs
  // declares `const ROUTES = [...]` above its tests and loops over it inside
  // them - a fixed list of four, and reporting it was noise.
  const fileLiterals = new Set(
    [...whole.matchAll(/(?:const|let)\s+(\w+)\s*=\s*\[/g)].map((m) => m[1])
  );

  // A floor asserted in a DEDICATED test counts as well.
  // features/authorization/admin-routes.test.js has a whole test that says
  // `assert.ok(routes.length >= 70, "the scanner is not working")` and then
  // three others that loop over the same list. That is the right shape - the
  // claim is made once, loudly - and flagging the loops would punish it.
  const flooredInFile = new Set(
    [...whole.matchAll(/assert\.\w+\(\s*(\w+)\.length/g)].map((m) => m[1])
  );

  for (const t of tests(source)) {
    scanned++;
    const body = stripComments(t.body);

    // ---- SKIP: an early return on a falsy fixture.
    const skips = [...body.matchAll(/if\s*\(\s*!([^)]{1,60})\)\s*(?:\{\s*)?return\b/g)];
    for (const skip of skips) {
      const subject = skip[1].trim();
      // Exempt: the same test asserts the fixture found something. An author
      // who wrote `assert.ok(rows.length)` has already made the claim.
      const asserted =
        new RegExp(`assert\\.ok\\([^)]*${subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(body) ||
        /assert\.ok\([^)]*\.length/.test(body);
      // Exempt: the return line carries a comment saying what dev may lack.
      const line = t.body.slice(skip.index).split("\n")[0];
      const explained = /\/\/\s*\S/.test(line);

      if (!asserted && !explained) {
        findings.push({
          kind: "SKIP", file: rel, line: t.startLine, name: t.name,
          detail: `returns when \`${subject}\` is falsy, with nothing asserting it was found`,
        });
      }
    }

    // ---- LOOP: iterating a result with no non-empty assertion anywhere.
    //
    // ONLY WHERE THE THING COULD BE EMPTY. A loop over a literal - `for (const
    // d of ["purchase", "sale"])` - runs a known number of times and is not a
    // risk. Reporting those buried the real findings 10 to 1 in the first
    // version, and a check that cries wolf gets switched off.
    //
    // What is left is a loop over something produced at RUNTIME: a query
    // result, an await, a filter. Those can be empty, and an empty one runs the
    // assertions zero times.
    const literalArrays = new Set([
      ...[...body.matchAll(/(?:const|let)\s+(\w+)\s*=\s*\[/g)].map((m) => m[1]),
      ...fileLiterals,
    ]);
    const couldBeEmpty = (expr) => {
      const e = expr.trim();
      if (e.startsWith("[")) return false;                 // a literal, inline
      if (/^Object\.(keys|values|entries)\(\s*\{/.test(e)) return false;
      const root = e.match(/^(\w+)/)?.[1];
      if (root && literalArrays.has(root)) return false;   // a literal, named
      if (root && flooredInFile.has(root)) return false;   // floored elsewhere
      return true;
    };

    const loops = [...body.matchAll(/for\s*\(\s*(?:const|let)\s+[^)]*\bof\s+([^)]{1,60})\)/g)]
      .filter((m) => couldBeEmpty(m[1]));
    const assertsNonEmpty =
      /assert\.ok\([^;]*\.length/.test(body) ||
      /assert\.(equal|notEqual)\([^;]*\.length/.test(body) ||
      /assert\.ok\(\s*\w+\[0\]/.test(body) ||
      // A FLOOR ON A COUNTER COUNTS. shared/http/browser-triggered-effects
      // counts what it scanned and asserts `total >= 15` - the author has
      // demonstrably thought about the scan finding nothing, which is the only
      // thing this check is asking.
      /assert\.ok\([^;]*>=\s*\d+/.test(body);

    for (const loop of loops) {
      const after = body.slice(loop.index);
      const loopAsserts = /assert\./.test(after.slice(0, 600));
      if (loopAsserts && !assertsNonEmpty) {
        findings.push({
          kind: "LOOP", file: rel, line: t.startLine, name: t.name,
          detail: `asserts inside \`for ... of ${loop[1].trim()}\` with nothing asserting it is non-empty`,
        });
      }
    }
  }
}

if (SELF_TEST) {
  // The detector has to fire on the shape it was written for, or its silence
  // means nothing. Both shapes, checked against a literal.
  const sample = `
    test("a skip nobody explained", async () => {
      const order = await anOrder(c);
      if (!order) return;
      assert.equal(order.status, "Pending");
    });
    test("a loop over nothing", async () => {
      const rows = await q("SELECT 1");
      for (const row of rows) assert.equal(row.n, 1);
    });
  `;
  let fired = 0;
  for (const t of tests(sample)) {
    const body = stripComments(t.body);
    if (/if\s*\(\s*!([^)]{1,60})\)\s*(?:\{\s*)?return\b/.test(body)) fired++;
    const hasLoop = /for\s*\(\s*(?:const|let)\s+[^)]*\bof\s+/.test(body);
    const nonEmpty = /assert\.ok\([^;]*\.length/.test(body);
    if (hasLoop && !nonEmpty) fired++;
  }
  console.log(fired === 2 ? "self-test: both shapes detected" : `self-test FAILED - ${fired}/2`);
  process.exit(fired === 2 ? 0 : 1);
}

console.log(`${scanned} test(s) in ${files.length} file(s) scanned\n`);

if (findings.length === 0) {
  console.log("no test can pass while asserting nothing");
} else {
  for (const kind of ["LOOP", "SKIP"]) {
    const group = findings.filter((f) => f.kind === kind);
    if (!group.length) continue;
    console.log(`${group.length} ${kind}:`);
    for (const f of group) {
      console.log(`  ${f.file}:${f.line}`);
      console.log(`      ${f.name}`);
      console.log(`      ${f.detail}`);
    }
    console.log();
  }
}

// Reported, not enforced. A skip can be legitimate and this cannot tell without
// the database; failing the build on it would make the honest fix "delete the
// comment". LOOP findings are the ones worth acting on.
