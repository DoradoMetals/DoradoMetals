// Every function a switch offers must exist in every state it can select.
//
// A switch is a set of re-exports:
//
//   export const getByCarrierId = impl.getByCarrierId;
//
// which is a perfectly valid export whose value is `undefined` if the selected
// implementation never defined it. Nothing fails at import; nothing fails at
// startup. The first call after promotion throws "impl.getByCarrierId is not a
// function", in production, on the deploy that flipped the switch.
//
// The indirection is what makes it easy to miss. Most features offer
// { exchange, dual }, and repo.dual re-exports its reads straight off
// repo.next:
//
//   export const getByCarrierId = next.getByCarrierId;
//
// So checking that repo.dual exports the name proves nothing at all - the name
// is there either way. The reference has to be followed to repo.next.
//
// This was written as a check that passed, which is how it was found to be
// useless: un-exporting getByCarrierId from what was then
// shipping/services/repo.next.ts left it reporting success, because repo.dual
// still had the name. It now fails on exactly that, which is the only reason to
// trust it. (That feature has since been restructured and has no switch at all;
// the example is kept because it is what the check was calibrated against.)
//
// Static - reads the files, needs no database.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const FEATURES = path.join(import.meta.dirname, "..", "..", "features");

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name === "repo.js" ? [full] : [];
  });

const readImpl = (dir, kind) => {
  for (const ext of ["js", "ts"]) {
    const file = path.join(dir, `repo.${kind}.${ext}`);
    if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  }
  return null;
};

const exportsOf = (src) => {
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s+const\s+([A-Za-z0-9_]+)/g)) names.add(m[1]);
  // `export { addFunds, removeFunds };` and `export { a as b } from "..."`.
  //
  // Missing this form reported transactions' repo.next as not exporting
  // addFunds when it plainly does. A false positive rather than a false
  // negative, so it failed safe - but a check nobody can trust to be right is
  // one people start editing around.
  for (const block of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const spec of block[1].split(",")) {
      const name = spec.trim().split(/\s+as\s+/).pop()?.trim();
      if (name && /^[A-Za-z0-9_]+$/.test(name)) names.add(name);
    }
  }
  return names;
};

// `export const getAll = next.getAll;` -> { as: "getAll", from: "getAll" }
const reexportsFrom = (src, module) =>
  [...src.matchAll(
    new RegExp(`export\\s+const\\s+([A-Za-z0-9_]+)\\s*=\\s*${module}\\.([A-Za-z0-9_]+)`, "g")
  )].map((m) => ({ as: m[1], from: m[2] }));

const switches = walk(FEATURES)
  .map((file) => ({ file, src: fs.readFileSync(file, "utf8") }))
  .filter(({ src }) => /process\.env\.[A-Z_]+_SOURCE/.test(src))
  .map(({ file, src }) => ({
    name: path.relative(FEATURES, path.dirname(file)),
    dir: path.dirname(file),
    src,
    states: (src.match(/const SOURCES = \{([^}]*)\}/)?.[1] ?? "")
      .split(",").map((s) => s.trim().split(":")[0].trim()).filter(Boolean),
    wired: [...src.matchAll(
      /export\s+const\s+([A-Za-z0-9_]+)\s*=\s*(?:impl|SOURCES\[SOURCE\])\.([A-Za-z0-9_]+)/g
    )].map((m) => ({ as: m[1], from: m[2] })),
  }));

test("there are switches to check", () => {
  // FLOOR COMES DOWN AS FEATURES ARE RESTRUCTURED. A restructured feature reads
  // the new schema and writes both unconditionally, so it has no switch to
  // select an implementation - there is only one. Lower this only alongside the
  // commit that removes a repo.js, and never to make a red build green; a count
  // that falls on its own means the parser broke. Mirrors SOURCE_FLOOR in
  // scripts/audit-switches.mjs, which is at 14 for the same reason.
  assert.ok(switches.length >= 9, `only found ${switches.length} switches`);
  for (const s of switches) {
    assert.ok(s.states.length, `${s.name}: could not read the SOURCES map`);
    assert.ok(s.wired.length, `${s.name}: no re-exported functions found`);
  }
});

test("every function a switch offers exists in every state it can select", () => {
  for (const s of switches) {
    for (const state of s.states) {
      const src = readImpl(s.dir, state);
      assert.ok(src, `${s.name}: SOURCES names "${state}" but there is no repo.${state}`);
      const have = exportsOf(src);
      for (const { as, from } of s.wired) {
        assert.ok(
          have.has(from),
          `${s.name}: repo.${state} does not export "${from}", so ${as} is undefined ` +
            `whenever that state is selected - the first call throws in production`
        );
      }
    }
  }
});

test("what dual re-exports actually exists in the module it comes from", () => {
  for (const s of switches.filter((x) => x.states.includes("dual"))) {
    const dual = readImpl(s.dir, "dual");
    assert.ok(dual, `${s.name}: SOURCES offers dual but there is no repo.dual`);

    for (const [module, label] of [["next", "repo.next"], ["exchange", "repo.exchange"]]) {
      const src = readImpl(s.dir, module);
      if (!src) continue;
      const have = exportsOf(src);
      for (const { as, from } of reexportsFrom(dual, module)) {
        assert.ok(
          have.has(from),
          `${s.name}: repo.dual exports ${as} as ${module}.${from}, but ${label} ` +
            `does not export ${from} - the name is present and the value is undefined`
        );
      }
    }
  }
});
