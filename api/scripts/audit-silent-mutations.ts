// Every UPDATE or DELETE whose caller cannot tell that it changed nothing.
//
// *** THE SHAPE. *** An UPDATE that matches no row is not an error in Postgres.
// It returns rowCount 0 and the transaction commits. So a statement whose WHERE
// has quietly stopped resolving - a link that moved, a join that was always
// wrong, an id that no longer exists - succeeds forever, and the only symptom is
// data that does not change.
//
// This project has already shipped that exact defect twice, in the same feature:
// `link_to_order.sql` and `set_method_for_order.sql` walked
// order -> payments.intents -> details, and an intent is money coming IN while a
// payout is money going OUT, so the join resolved for ZERO of the sixteen dev
// payouts. Neither statement raised. D168 found it by measuring, not by testing
// - every test passed, because a test writes its own fixture and then reads it.
//
// *** WHY THIS MATTERS MORE NOW. *** Ruling 36 lets `exchange` stop receiving
// writes. Today most of these calls have an `exchange` half beside them that
// does work, so a silent native no-op is invisible but harmless. When the
// legacy half goes, the silent half is the ONLY half.
//
//   node scripts/audit-silent-mutations.ts
//   node scripts/audit-silent-mutations.ts --self-test
//
// *** SCOPED TIGHTLY ON PURPOSE. *** locks.ts records that a check with false
// positives gets suppressed, and that is the failure mode to avoid here. So:
//   - only functions whose .sql file actually begins UPDATE or DELETE. An
//     INSERT that generates its own id has nothing to assert.
//   - only call sites that DISCARD the result: `await x.f(...)` as a statement,
//     never `const r = await x.f(...)` or `return await x.f(...)`.
//   - a statement with no RETURNING and a repo returning void is reported as
//     UNOBSERVABLE, which is a stronger finding than a discarded return.
// *** IT IS A CEILING, NOT A REPORT. *** The first version exited 0 always,
// which made it a map of where to look and nothing more - and a report nobody
// is forced to read is a report that rots. The 18 that remain are triaged in
// D202 as correct (DELETEs, where removing something already gone is idempotent,
// and setDefault_clear, where a first address has no previous default). So the
// count is pinned: a NINETEENTH silent mutation fails the gate, and fixing one
// of the eighteen ALSO fails until the ceiling is lowered to match. Pinned from
// both sides, like audit:indexes' ACCEPTED and lint-script-guards' EXCUSED.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.env.AUDIT_SILENT_ROOT ?? path.resolve(import.meta.dirname, "..");

if (process.argv.includes("--self-test")) {
  const { selfTest } = await import("./lib/self-test-harness.ts");
  const repo = `
    const sql = sqlFrom(import.meta.dirname);
    export async function bump(id, executor) {
      const { rows } = await query(sql("bump"), [id], executor);
      return rows.map((r) => r.id);
    }
  `;
  await selfTest({
    script: new URL(import.meta.url).pathname,
    cases: [
      {
        name: "a discarded UPDATE result is seen",
        rootEnv: "AUDIT_SILENT_ROOT",
        files: {
          "db/x/sql/bump.sql": "UPDATE t SET a = 1 WHERE id = $1 RETURNING id",
          "db/x/repo.ts": repo,
          "domain/x/service.ts": "import * as xRepo from \"#db/x/repo.ts\";\nawait xRepo.bump(id, c);\n",
        },
        expect: "fail",
        mustPrint: "bump",
      },
      {
        name: "an observed UPDATE result is not reported",
        rootEnv: "AUDIT_SILENT_ROOT",
        files: {
          "db/x/sql/bump.sql": "UPDATE t SET a = 1 WHERE id = $1 RETURNING id",
          "db/x/repo.ts": repo,
          "domain/x/service.ts": "import * as xRepo from \"#db/x/repo.ts\";\nconst changed = await xRepo.bump(id, c);\n",
        },
        expect: "pass",
        mustPrint: "0 discarded",
      },
      {
        name: "an INSERT is not a finding",
        rootEnv: "AUDIT_SILENT_ROOT",
        files: {
          "db/x/sql/bump.sql": "INSERT INTO t (id) VALUES ($1) RETURNING id",
          "db/x/repo.ts": repo,
          "domain/x/service.ts": "import * as xRepo from \"#db/x/repo.ts\";\nawait xRepo.bump(id, c);\n",
        },
        expect: "pass",
        mustPrint: "0 discarded",
      },
    ],
  });
}

const FAIL_ON_FINDINGS = process.env.AUDIT_SILENT_ROOT != null;

// Calls where a zero-row outcome is CORRECT, with the reason. Keyed by
// `<file>::<ns>.<fn>` and not by line, so moving code does not silently drop an
// acceptance.
//
// PINNED FROM BOTH SIDES, exactly as audit:indexes' ACCEPTED is: an entry that
// stops matching anything is itself reported, so a call that gets fixed - or
// deleted - forces its acceptance out of this map rather than sitting here
// describing something that no longer exists.
const ACCEPTED: Record<string, string> = {
  "domain/sales-tax/service.ts::tax.accrue":
    "scoped to `reached_nexus = true`, and sql/accrue.sql says so in its own " +
    "header: a state below its threshold accrues nothing, so an UPDATE matching " +
    "no row is the correct outcome and not a failure. The legacy implementation " +
    "it replaces was scoped the same way.",
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
    else out.push(full);
  }
  return out;
}

// Three layer roots instead of one `features/` tree (Phase 0c restructure):
// db/ holds the repo + sql, domain/ holds the service that calls it. A scan
// of only one root would miss the caller half entirely.
const files = ["db", "domain", "transport"].flatMap((layer) => walk(path.join(ROOT, layer)));
const rel = (f: string) => path.relative(ROOT, f);

// 1. every .sql that is an UPDATE or a DELETE, and whether it RETURNs.
type Stmt = { verb: string; returning: boolean };
const statements = new Map<string, Stmt>();   // "db/x/sql/bump" -> stmt
for (const f of files.filter((f) => f.endsWith(".sql"))) {
  const body = readFileSync(f, "utf8")
    .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").trim();
  const verb = /^\s*(UPDATE|DELETE)\b/i.exec(body)?.[1]?.toUpperCase();
  if (!verb) continue;
  statements.set(rel(f).replace(/\.sql$/, ""), {
    verb, returning: /\bRETURNING\b/i.test(body),
  });
}

// 2. every repo function that runs one of them, and whether it hands anything back.
type Fn = { file: string; name: string; stmt: Stmt; sqlKey: string; returnsValue: boolean };
const fns: Fn[] = [];
for (const f of files.filter((f) => /repo(\.\w+)?\.(ts|js)$/.test(f))) {
  const src = readFileSync(f, "utf8");
  const sqlDir = path.join(path.dirname(rel(f)), "sql");
  // export async function NAME( ... ) { ... }  - matched to the next export
  const re = /export\s+async\s+function\s+(\w+)\s*\([\s\S]*?\{([\s\S]*?)(?=\n(?:export|\/\*\*|\/\/ ---)|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const [, name, body] = m as unknown as [string, string, string];
    const key = /sql\(\s*["'](\w+)["']\s*\)/.exec(body)?.[1]
      ?? /\b([A-Z_]{3,})\b\s*,/.exec(body)?.[1];
    if (!key) continue;
    // resolve either sql("name") or a CONST = sql("name") declared above
    const direct = path.join(sqlDir, key);
    const viaConst = (() => {
      const c = new RegExp(`const\\s+${key}\\s*=\\s*sql\\(\\s*["'](\\w+)["']`).exec(src)?.[1];
      return c ? path.join(sqlDir, c) : null;
    })();
    const resolved = statements.has(direct) ? direct : viaConst && statements.has(viaConst) ? viaConst : null;
    if (!resolved) continue;
    fns.push({
      file: rel(f), name, stmt: statements.get(resolved)!, sqlKey: resolved,
      returnsValue: /\breturn\s+(?!;)/.test(body),
    });
  }
}

// 3. call sites that throw the result away.
//
// *** RESOLVED THROUGH THE IMPORT, NOT BY NAME. *** The first version of this
// matched on the function name alone, and `remove`, `update` and `create` are
// declared in a dozen repos each - so `legacy.remove()` in shipping/tracking was
// attributed to fulfillments/directs/sql/delete, a different feature entirely.
// It reported 54 findings, most of them pointing at the wrong file. A check with
// false positives gets suppressed (shared/testing/locks.ts records that lesson
// costing a shipped feature), so the namespace is resolved to the module the
// calling file actually imported.
const byFile = new Map<string, Fn[]>();
for (const fn of fns) byFile.set(fn.file, [...(byFile.get(fn.file) ?? []), fn]);

// "#db/x/repo.ts", "#domain/x/service.ts" or "./repo.ts" -> "db/x/repo.ts" etc.
function resolveSpecifier(fromFile: string, spec: string): string | null {
  if (spec.startsWith("#db/") || spec.startsWith("#domain/") || spec.startsWith("#transport/")) {
    return spec.slice(1);
  }
  if (spec.startsWith(".")) {
    return path.normalize(path.join(path.dirname(fromFile), spec));
  }
  return null;
}

let discarded = 0, unobservable = 0;
const findings: string[] = [];

for (const f of files.filter((f) => /\.(ts|js)$/.test(f) && !/\.test\./.test(f) && !/\/tests\//.test(f))) {
  const src = readFileSync(f, "utf8");
  const self = rel(f);

  // namespace -> repo file, from this file's own imports.
  const ns2file = new Map<string, string>();
  const importRe = /import\s+(?:\*\s+as\s+(\w+)|(\w+))\s+from\s+["']([^"']+)["']/g;
  let im: RegExpExecArray | null;
  while ((im = importRe.exec(src))) {
    const alias = (im[1] ?? im[2])!;
    const target = resolveSpecifier(self, im[3]!);
    if (target) ns2file.set(alias, target);
  }

  src.split("\n").forEach((line, i) => {
    const call = /^\s*await\s+(\w+)\.(\w+)\s*\(/.exec(line);
    if (!call) return;
    const [, ns, name] = call as unknown as [string, string, string];
    const target = ns2file.get(ns);
    if (!target) return;                       // not an imported repo namespace
    const fn = (byFile.get(target) ?? []).find((x) => x.name === name);
    if (!fn) return;                           // that module has no such mutation

    const where = `${self}:${i + 1}`;
    const key = `${self}::${ns}.${name}`;
    if (ACCEPTED[key]) { acceptedHit.add(key); return; }
    if (!fn.stmt.returning && !fn.returnsValue) {
      unobservable += 1;
      findings.push(`  UNOBSERVABLE  ${where}\n                ${ns}.${name}() -> ${fn.stmt.verb} ${fn.sqlKey}\n                no RETURNING and the repo hands nothing back: zero rows is indistinguishable from success`);
    } else {
      discarded += 1;
      findings.push(`  DISCARDED     ${where}\n                ${ns}.${name}() -> ${fn.stmt.verb} ${fn.sqlKey}\n                the repo returns a result and the caller drops it`);
    }
  });
}

console.log(`${statements.size} UPDATE/DELETE statement(s), ${fns.length} repo function(s) running one\n`);
for (const f of findings) console.log(f);
console.log(`\n${discarded} discarded result(s), ${unobservable} unobservable call(s), ${acceptedHit.size} accepted`);

for (const [key, why] of Object.entries(ACCEPTED)) {
  if (acceptedHit.has(key)) console.log(`  accepted  ${key}\n            ${why}`);
}

// THE OTHER HALF OF THE PIN. An acceptance that matches nothing is describing a
// call that has been fixed, moved or deleted - so it must not stay here quietly
// excusing something that no longer exists.
const stale = Object.keys(ACCEPTED).filter((k) => !acceptedHit.has(k));
if (stale.length && !FAIL_ON_FINDINGS) {
  console.error(`\n${stale.length} ACCEPTED entr(y/ies) matched no call:`);
  for (const k of stale) console.error(`  ${k}`);
  console.error("remove them - the call they excuse is gone or has changed shape");
  process.exit(1);
}

// THE FLOOR, and it applies to the REAL tree only. A walk of `features/` that
// finds no UPDATE or DELETE is broken, not clean - that is the empty-scan defect
// this codebase has shipped six times. But a synthetic self-test tree is allowed
// to contain only an INSERT, and asserting the floor there made the "an INSERT
// is not a finding" case fail for the wrong reason.
if (!FAIL_ON_FINDINGS && statements.size === 0) {
  console.error("\nSCAN IS BROKEN: no UPDATE or DELETE statements found at all");
  process.exit(1);
}
if (FAIL_ON_FINDINGS && (discarded || unobservable)) process.exit(1);

// THE CEILING. Every one of these is triaged in D202; the number is the
// agreement, not a target. Moving it in either direction is a deliberate edit
// with a reason, which is the point.
// 18 -> 24 with the D212 purge: six calls whose exchange half used to be the
// observed statement became the ONLY statement when the dual layer died -
// orders/service's clearBids, setPrice, updateScrap, setAssay and setPremium
// (x2), and payouts' setMethodForOrder. Each runs inside the transaction of a
// pipeline whose earlier reads already establish the row, so a zero-row
// update is "nothing to do" rather than a lost edit; observing them with
// throws is a hardening pass of its own, not this purge's.
// 24 -> 23 with CRUD-batch-3's refiners/shipping/fulfillments collapse:
// fulfillments/service.ts's setMethod and setStatus used to capture the row
// setMethod/setStatus RETURNED (never discarding it); the collapse to one
// `update(id, patch, ...) -> boolean` per D212's CRUD ruling meant a caller
// had to start checking that boolean instead of just re-reading the row, and
// both now do - setStatus returns null on a false the same as the row-based
// version's `composeOne(undefined)` did, and setMethod throws a 500 (the id
// was already read moments earlier in the same function, so a false there is
// a genuine contradiction, not a normal miss). Net: two calls that were never
// discards under the old shape stayed non-discards under the new one.
// 23 -> 20 with the AUDIT STAMP (migration 116). Three UPDATEs whose whole
// purpose was an audit column stopped existing: the two `updated_at = now()`
// statements in payments/repo.ts's webhook path and the per-column audit
// writes the batch-1 and batch-2 statements carried. None was observed and
// none needed to be - a stamp that fails to land is not a lost edit - but they
// are gone rather than accepted, which is the better kind of reduction.
const CEILING = 20;
if (!FAIL_ON_FINDINGS) {
  const total = discarded + unobservable;
  if (total > CEILING) {
    console.error(
      `\n${total} silent mutation(s), and the agreed ceiling is ${CEILING}.\n` +
      `Something new discards a mutation result. Either observe it - see\n` +
      `shared/observability/report.ts, and D202 for the five that were fixed\n` +
      `that way - or raise the ceiling with a reason.`
    );
    process.exit(1);
  }
  if (total < CEILING) {
    console.error(
      `\n${total} silent mutation(s), below the ceiling of ${CEILING}. Good -\n` +
      `now lower CEILING to ${total} so the gain cannot be given back silently.`
    );
    process.exit(1);
  }
}
