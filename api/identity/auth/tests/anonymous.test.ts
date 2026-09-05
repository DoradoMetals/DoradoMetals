import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  ROLE_DEFAULT, fillMissingRole, withoutAnonymousCustomers,
} from "#identity/auth/anonymous.ts";

test("a create with no role gets the default", () => {
  const filled = fillMissingRole({ email: "temp@x.invalid", isAnonymous: true });
  assert.equal(filled?.data.role, ROLE_DEFAULT);
  assert.equal(filled?.data.email, "temp@x.invalid", "the rest of the row is untouched");
});

test("a create that already names a role is left alone", () => {
  assert.equal(fillMissingRole({ role: "admin" }), undefined);
});

type Hook = (user: { isAnonymous?: unknown }, ctx: never) => unknown;
type Init = { options?: { databaseHooks?: { user?: { create?: { after?: Hook } } } } };

const fakePlugin = (after: Hook) => ({
  id: "stripe",
  init: (_ctx?: unknown): Init => (
    { options: { databaseHooks: { user: { create: { after } } } } }
  ),
});

test("the wrapped plugin's user-create hook skips an anonymous visitor", () => {
  const seen: unknown[] = [];
  const plugin = withoutAnonymousCustomers(fakePlugin((user) => { seen.push(user); }));
  const hooks = plugin.init()?.options?.databaseHooks?.user?.create;

  hooks?.after?.({ isAnonymous: true }, undefined as never);
  assert.deepEqual(seen, [], "a visitor never reaches Stripe");

  hooks?.after?.({ isAnonymous: false }, undefined as never);
  hooks?.after?.({}, undefined as never);
  assert.equal(seen.length, 2, "a real sign-up still gets its Stripe customer");
});

test("a plugin with no init is reported rather than silently unwrapped", () => {
  const errors: string[] = [];
  const console_error = console.error;
  console.error = (...args: unknown[]) => { errors.push(String(args[0])); };
  try {
    const plugin = withoutAnonymousCustomers({ id: "stripe" });
    assert.equal(plugin.id, "stripe");
  } finally {
    console.error = console_error;
  }
  assert.match(errors.join("\n"), /withoutAnonymousCustomers/);
});

test("a plugin whose hook has moved is reported rather than silently unwrapped", () => {
  const errors: string[] = [];
  const console_error = console.error;
  console.error = (...args: unknown[]) => { errors.push(String(args[0])); };
  try {
    const stripped = withoutAnonymousCustomers({
      id: "stripe",
      init: (_ctx?: unknown): Init => ({ options: {} }),
    });
    stripped.init();
  } finally {
    console.error = console_error;
  }
  assert.match(errors.join("\n"), /no longer registers a databaseHooks/);
});

test("@better-auth/stripe still creates its customer where the wrapper reaches", () => {
  const build = path.join(
    process.cwd(), "node_modules", "@better-auth", "stripe", "dist", "index.mjs"
  );
  const source = fs.readFileSync(build, "utf8");
  assert.ok(source.length > 10_000, "the stripe plugin build did not read - a check " +
    "that reads nothing accepts everything");

  const flat = source.replace(/\s+/g, " ");
  assert.match(
    flat,
    /databaseHooks: \{ user: \{ create: \{ async after\(user, ctx\)/,
    "the customer-creation hook is no longer databaseHooks.user.create.after, " +
      "so withoutAnonymousCustomers is wrapping nothing"
  );
  assert.match(
    flat,
    /!options\.createCustomerOnSignUp \|\| user\.stripeCustomerId/,
    "the hook's own guard changed shape - re-read it before trusting the wrapper"
  );
});

test("better-auth 1.6.9's anonymous plugin declares the column this codebase added", () => {
  const schema = path.join(
    process.cwd(), "node_modules", "better-auth", "dist", "plugins", "anonymous",
    "schema.mjs"
  );
  const source = fs.readFileSync(schema, "utf8");
  assert.match(source, /user:\s*\{\s*fields:\s*\{\s*isAnonymous/);
  assert.match(source, /type:\s*"boolean"/);
});
