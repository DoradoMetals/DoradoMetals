import { defineConfig } from "vitest/config";
import path from "node:path";
import "./env.ts";
import { classifyTestFiles } from "./scripts/lib/test-layers.ts";
import { domainDirs, importMap } from "./scripts/lib/layout.ts";

const ROOT = import.meta.dirname;

const sharedEnv: Record<string, string> = {
  TZ: "UTC",
  NODE_ENV: "test",
  USE_TEST_DB: process.env.USE_TEST_DB ?? "1",
};
if (process.env.DATABASE_URL) sharedEnv.DATABASE_URL = process.env.DATABASE_URL;
if (process.env.TEST_DATABASE_URL) sharedEnv.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
if (process.env.TEST_DATABASE) sharedEnv.TEST_DATABASE = process.env.TEST_DATABASE;

const exact = (specifier: string, target: string) => ({
  find: new RegExp(`^${specifier}$`),
  replacement: path.resolve(ROOT, target),
});
const wildcard = (prefix: string, dir: string) => ({
  find: new RegExp(`^${prefix}\\/`),
  replacement: path.resolve(ROOT, dir) + "/",
});

const alias = Object.entries(importMap(ROOT)).map(([specifier, target]) =>
  specifier.endsWith("/*")
    ? wildcard(specifier.slice(0, -2), target.replace(/^\.\//, "").replace(/\/\*$/, ""))
    : exact(specifier, target.replace(/^\.\//, ""))
);

const DOMAIN_GLOB = `{${domainDirs(ROOT).join(",")}}/**`;

const layers = classifyTestFiles(ROOT);
const rel = (files: string[]) => files.map((f) => path.relative(ROOT, f));

function project(name: string, files: string[]) {
  return {
    extends: true as const,
    test: {
      name,
      include: rel(files),
    },
  };
}

export default defineConfig({
  test: {
    globals: false,
    pool: "forks",
    isolate: true,
    setupFiles: ["./shared/testing/vitest-setup.ts"],
    env: sharedEnv,
    testTimeout: 20_000,
    hookTimeout: 20_000,
    maxWorkers: 12,
    exclude: ["node_modules/**", "tests-external/**"],
    projects: [
      project("unit", layers.unit),
      project("db", layers.db),
      project("http", layers.http),
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "./coverage",
      exclude: [
        "node_modules/**",
        "**/tests/**",
        "**/*.test.ts",
        "scripts/**",
        "tests-external/**",
        "migrations/**",
      ],
      thresholds: {
        "db/**": { statements: 88, branches: 74, functions: 94, lines: 94 },
        [DOMAIN_GLOB]: { statements: 86, branches: 73, functions: 90, lines: 88 },
        "shared/**": { statements: 80, branches: 74, functions: 86, lines: 83 },
      },
    },
  },
  resolve: { alias },
});
