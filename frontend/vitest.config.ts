import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests only: pure functions and the shapes the API contract depends on.
// They run in plain Node, need no DOM implementation and no testing library,
// and finish in seconds - which is what lets `pnpm check` run them on every
// change.
//
// THE END-TO-END TESTS ARE NOT THESE. They live beside the feature they test as
// `<feature>/tests/*.e2e.ts`, are
// driven by Playwright against a real browser and a live API, and run under
// `pnpm --filter @dorado/frontend e2e`. They are excluded here twice over - by
// the .test.ts include pattern and by the explicit exclude below - because the
// separation matters more than it looks: vitest picking up a Playwright spec
// fails confusingly, and adding minutes of browser startup to `pnpm check`
// would make the check something people skip.
export default defineConfig({
  test: {
    environment: "node",
    // Component render tests are .test.tsx and get jsdom; everything .test.ts
    // stays pure-function-in-node. The split keeps the fast lane fast: a pure
    // test never pays for a DOM, and a component test never pretends it does
    // not need one.
    environmentMatchGlobs: [["**/*.test.tsx", "jsdom"]],
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**", "**/*.e2e.ts"],
  },
  resolve: {
    // Matches the `@/*` path alias in tsconfig.json.
    alias: { "@": path.resolve(import.meta.dirname, ".") },
  },
});
