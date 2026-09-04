import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const HERE = import.meta.dirname;
const API = path.resolve(HERE, "../../..");
const MIDDLEWARE = path.join(API, "shared/middleware/authMiddleware.ts");

const routeFiles = (() => {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/^routes\.(ts|js)$/.test(e.name)) out.push(full);
    }
  };
  walk(path.join(API, "transport"));
  return out;
})();

const mounts = (guard: string) =>
  routeFiles.filter((f: string) => new RegExp(`\\b${guard}\\b`).test(fs.readFileSync(f, "utf8")));

test("the scan reaches the route files at all", () => {
  assert.ok(routeFiles.length >= 20, `only ${routeFiles.length} route file(s) found`);
  assert.ok(mounts("requireAdmin").length > 0, "requireAdmin appears in no route file");
  assert.ok(mounts("requireUser").length > 0, "requireUser appears in no route file");
});

test("the ladder has exactly three rungs, in this order", () => {
  const src = fs.readFileSync(MIDDLEWARE, "utf8");
  const body = src.slice(src.indexOf("const roleLevels"), src.indexOf("} as const"));
  const rungs = [...body.matchAll(/(\w+):\s*(\d+)/g)].map(([, name, n]) => [name, Number(n)]);
  assert.deepEqual(rungs, [
    ["user", 1],
    ["verified_user", 2],
    ["admin", 3],
  ]);
});

test("requireVerifiedUser is mounted on no route, and mounting it locks out every customer", () => {
  const used = mounts("requireVerifiedUser");
  assert.deepEqual(
    used.map((f) => path.relative(API, f)),
    [],
    "requireVerifiedUser has been mounted. Before keeping this, read the note " +
      "at the top of this file: it checks a ROLE that no user holds (production " +
      "is 73 user / 2 admin, none verified_user) and never reads emailVerified, " +
      "so the route now refuses every customer and admits every admin."
  );
});

test("the guard does not consult emailVerified, whatever its name suggests", () => {
  const src = fs.readFileSync(MIDDLEWARE, "utf8");
  const code = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(
    code,
    /emailVerified/,
    "authMiddleware now reads emailVerified - if verification is being enforced, " +
      "this test and the note above it are out of date"
  );
});

test("an unrecognised role is refused rather than trusted", () => {
  const src = fs.readFileSync(MIDDLEWARE, "utf8");
  assert.match(src, /userRole && userRole in roleLevels \? roleLevels\[userRole as Role\] : 0/);
  assert.match(src, /userLevel < requiredLevel/);
});
