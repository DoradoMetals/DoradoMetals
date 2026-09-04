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

function tests(source) {
  const out = [];
  const opener = /\btest\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
  let m;
  while ((m = opener.exec(source)) !== null) {
    const name = m[2];
    const startLine = source.slice(0, m.index).split("\n").length;

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

const files = ["db", "domain", "transport", "shared"].flatMap((l) => walk(path.join(ROOT, l)));

if (!SELF_TEST && files.length < 60) {
  console.error(`only ${files.length} test file(s) found - the walk is broken`);
  process.exit(1);
}

let scanned = 0;

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const rel = path.relative(ROOT, file);
  const whole = stripComments(source);

  const fileLiterals = new Set(
    [...whole.matchAll(/(?:const|let)\s+(\w+)\s*=\s*\[/g)].map((m) => m[1])
  );

  const flooredInFile = new Set(
    [...whole.matchAll(/assert\.\w+\(\s*(\w+)\.length/g)].map((m) => m[1])
  );

  for (const t of tests(source)) {
    scanned++;
    const body = stripComments(t.body);

    const skips = [...body.matchAll(/if\s*\(\s*!([^)]{1,60})\)\s*(?:\{\s*)?return\b/g)];
    for (const skip of skips) {
      const subject = skip[1].trim();
      const asserted =
        new RegExp(`assert\\.ok\\([^)]*${subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(body) ||
        /assert\.ok\([^)]*\.length/.test(body);
      const line = t.body.slice(skip.index).split("\n")[0];
      const explained = /\/\/\s*\S/.test(line);

      if (!asserted && !explained) {
        findings.push({
          kind: "SKIP", file: rel, line: t.startLine, name: t.name,
          detail: `returns when \`${subject}\` is falsy, with nothing asserting it was found`,
        });
      }
    }

    const literalArrays = new Set([
      ...[...body.matchAll(/(?:const|let)\s+(\w+)\s*=\s*\[/g)].map((m) => m[1]),
      ...fileLiterals,
    ]);
    const couldBeEmpty = (expr) => {
      const e = expr.trim();
      if (e.startsWith("[")) return false;
      if (/^Object\.(keys|values|entries)\(\s*\{/.test(e)) return false;
      const root = e.match(/^(\w+)/)?.[1];
      if (root && literalArrays.has(root)) return false;
      if (root && flooredInFile.has(root)) return false;
      return true;
    };

    const loops = [...body.matchAll(/for\s*\(\s*(?:const|let)\s+[^)]*\bof\s+([^)]{1,60})\)/g)]
      .filter((m) => couldBeEmpty(m[1]));
    const assertsNonEmpty =
      /assert\.ok\([^;]*\.length/.test(body) ||
      /assert\.(equal|notEqual)\([^;]*\.length/.test(body) ||
      /assert\.ok\(\s*\w+\[0\]/.test(body) ||
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
