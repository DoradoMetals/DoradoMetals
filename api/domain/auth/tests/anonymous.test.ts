// THE TWO SEAMS BETWEEN better-auth's ANONYMOUS PLUGIN AND THIS CODEBASE
// (ruling 63). Neither is an option better-auth offers, so neither is covered
// by config-options.test.ts's "every option is one better-auth reads" sweep -
// and both fail SILENTLY if they stop working: a visitor with no role gets 403
// on every basket write, and a visitor with a Stripe customer costs two
// provider round-trips per first basket touch and leaves junk behind forever.
//
// NO DATABASE AND NO NETWORK: the role hook is a pure function and the plugin
// wrapper is exercised against a synthetic plugin. The one thing that must be
// checked against reality - that @better-auth/stripe still hangs its
// customer-creation on the hook this reaches for - is checked by READING its
// build, the way config-options.test.ts reads better-auth's.
import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  ROLE_DEFAULT, fillMissingRole, withoutAnonymousCustomers,
} from "#domain/auth/anonymous.ts";

// ------------------------------------------------------------------ the role

test("a create with no role gets the default", () => {
  // The real case: the anonymous plugin calls internalAdapter.createUser
  // directly, which never runs the additionalFields defaults the sign-up route
  // runs. Without this the column lands NULL and authMiddleware's role ladder
  // scores the visitor at 0 - below `user` - so every checkout route 403s.
  const filled = fillMissingRole({ email: "temp@x.invalid", isAnonymous: true });
  assert.equal(filled?.data.role, ROLE_DEFAULT);
  assert.equal(filled?.data.email, "temp@x.invalid", "the rest of the row is untouched");
});

test("a create that already names a role is left alone", () => {
  // An admin created by a seed or a script says what they are; a default that
  // overwrote it would quietly demote them.
  assert.equal(fillMissingRole({ role: "admin" }), undefined);
});

// -------------------------------------------------- no Stripe customer for a visitor

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
  // Returning the plugin untouched is the right runtime behaviour - refusing to
  // boot over this would take auth down - but it must not be invisible.
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

// ------------------------------------ the pin against the real @better-auth/stripe

test("@better-auth/stripe still creates its customer where the wrapper reaches", () => {
  // The wrapper is monkeypatching, and this is what keeps it honest. If a
  // version bump moves customer creation somewhere else, this fails at
  // `pnpm check` - rather than every visitor quietly arriving in Stripe.
  const build = path.join(
    process.cwd(), "node_modules", "@better-auth", "stripe", "dist", "index.mjs"
  );
  const source = fs.readFileSync(build, "utf8");
  assert.ok(source.length > 10_000, "the stripe plugin build did not read - a check " +
    "that reads nothing accepts everything");

  // Whitespace-normalised: the build is minified-ish and its line breaks are
  // not a contract.
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
  // Migration 122 adds auth.users."isAnonymous" by hand, because better-auth
  // never migrates this database. This is the pin that the hand-written column
  // is still the one the plugin writes.
  const schema = path.join(
    process.cwd(), "node_modules", "better-auth", "dist", "plugins", "anonymous",
    "schema.mjs"
  );
  const source = fs.readFileSync(schema, "utf8");
  assert.match(source, /user:\s*\{\s*fields:\s*\{\s*isAnonymous/);
  assert.match(source, /type:\s*"boolean"/);
});
