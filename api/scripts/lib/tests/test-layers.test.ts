import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { classifyTestFiles } from "../test-layers.ts";

function tree(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "test-layers-selftest-"));
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);
  }
  return dir;
}

test("an http-signal file (imports supertest) is classified http, even when it also touches #db", () => {
  const root = tree({
    "domain/orders/tests/endpoints.test.ts":
      'import request from "supertest";\nimport pool from "#pool";\ntest("x", () => {});\n',
  });
  const layers = classifyTestFiles(root);
  assert.deepEqual(layers.http.map((f) => path.relative(root, f)), [
    "domain/orders/tests/endpoints.test.ts",
  ]);
  assert.equal(layers.unit.length, 0);
  assert.equal(layers.db.length, 0);
});

test("a db-signal file (imports #db, no supertest) is classified db", () => {
  const root = tree({
    "db/orders/tests/repo.test.ts":
      'import orders from "#db/orders/repo.ts";\ntest("x", () => {});\n',
  });
  const layers = classifyTestFiles(root);
  assert.deepEqual(layers.db.map((f) => path.relative(root, f)), [
    "db/orders/tests/repo.test.ts",
  ]);
  assert.equal(layers.http.length, 0);
  assert.equal(layers.unit.length, 0);
});

test("a file with neither signal is classified unit", () => {
  const root = tree({
    "shared/utils/tests/format.test.ts":
      'const format = (n) => String(n);\ntest("x", () => { format(1); });\n',
  });
  const layers = classifyTestFiles(root);
  assert.deepEqual(layers.unit.map((f) => path.relative(root, f)), [
    "shared/utils/tests/format.test.ts",
  ]);
  assert.equal(layers.db.length, 0);
  assert.equal(layers.http.length, 0);
});

test("node_modules is never descended into, even when it holds a matching filename", () => {
  const root = tree({
    "node_modules/some-pkg/nested.test.ts": 'import request from "supertest";\n',
    "domain/leads/tests/unit.test.ts": 'test("x", () => {});\n',
  });
  const layers = classifyTestFiles(root);
  assert.deepEqual(layers.all.map((f) => path.relative(root, f)), [
    "domain/leads/tests/unit.test.ts",
  ]);
});

test("a non-.test.ts file is never picked up", () => {
  const root = tree({
    "domain/leads/service.ts": "export const x = 1;\n",
    "domain/leads/tests/unit.test.ts": 'test("x", () => {});\n',
  });
  const layers = classifyTestFiles(root);
  assert.equal(layers.all.length, 1);
  assert.equal(path.relative(root, layers.all[0]!), "domain/leads/tests/unit.test.ts");
});

test("all three buckets partition the tree with no overlap and no loss", () => {
  const root = tree({
    "domain/orders/tests/endpoints.test.ts": 'import request from "supertest";\n',
    "db/orders/tests/repo.test.ts": 'import x from "#db/orders/repo.ts";\n',
    "shared/utils/tests/format.test.ts": 'const f = (n) => String(n);\n',
  });
  const layers = classifyTestFiles(root);
  assert.equal(layers.unit.length + layers.db.length + layers.http.length, layers.all.length);
  assert.equal(layers.all.length, 3);
});
