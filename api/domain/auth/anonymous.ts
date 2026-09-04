// THE TWO THINGS BETTER-AUTH'S ANONYMOUS PLUGIN DOES NOT DO FOR US.
//
// Ruling 63 puts a real auth.users row behind every visitor, minted by
// better-auth 1.6.9's `anonymous` plugin on POST /api/auth/sign-in/anonymous.
// The plugin is small and does exactly what it says; these are the two seams
// where the rest of this codebase has to meet it, kept out of client.ts so each
// one can carry its reason and be tested on its own.

import { reportError } from "#shared/observability/report.ts";

// ------------------------------------------------------------ 1. the ROLE
//
// A VISITOR WOULD OTHERWISE HAVE NO ROLE AT ALL, and every checkout route is
// `requireUser`.
//
// `user.additionalFields.role` in client.ts declares `defaultValue: 'user'`,
// and better-auth applies that default in `parseInputData` - which runs on the
// SIGN-UP ROUTE's body, not inside `internalAdapter.createUser`. The anonymous
// plugin calls createUser DIRECTLY with a literal object
// (dist/plugins/anonymous/index.mjs), so the default never runs, `role` lands
// NULL, and authMiddleware's `roleLevels[undefined]` resolves to level 0 -
// below `user`. Every basket write a visitor makes would 403.
//
// So the default is applied where every create goes past, whatever route it
// came from. `databaseHooks` is a first-class better-auth option and this hook
// is the LAST word before the adapter's INSERT.
export const ROLE_DEFAULT = "user";

// Generic over the row better-auth hands it, so the patch it answers is the
// SAME shape plus a role - a `Record<string, unknown>` here would not satisfy
// the hook's own `Optional<User> & Record<string, unknown>` return type.
export function fillMissingRole<T extends Record<string, unknown>>(
  user: T
): { data: T & { role: string } } | undefined {
  if (user.role) return undefined;
  return { data: { ...user, role: ROLE_DEFAULT } };
}

// -------------------------------------------- 2. NO STRIPE CUSTOMER FOR A VISITOR
//
// @better-auth/stripe's `createCustomerOnSignUp: true` registers a
// `databaseHooks.user.create.after` that SEARCHES Stripe for a customer with
// the new user's email and CREATES one when it finds none. It fires for every
// user better-auth creates - which, after ruling 63, includes every visitor who
// touches a basket.
//
// TWO REASONS THAT IS NOT ACCEPTABLE, and the second is the one that decided
// it: the junk (a Stripe customer named "Anonymous" at a temp-…@…invalid
// address for every crawler that ever added an item, none of which is ever
// deleted), and the LATENCY - two Stripe round-trips inside the request that
// adds the first item to a basket, which also makes "can this visitor shop"
// depend on Stripe being reachable. A real customer still gets one: signing up
// creates a SECOND, non-anonymous user, and the hook fires normally for it.
//
// WHY A WRAPPER AND NOT AN OPTION. There is no option. The plugin's guard is
// `if (!ctx || !options.createCustomerOnSignUp || user.stripeCustomerId)
// return;` - a boolean read from the options object and a column. Turning the
// boolean off would take the customer away from real sign-ups too, and the only
// way to satisfy the third clause is to write a fake Stripe id into
// `stripeCustomerId`, which is a lie in the database that the payments feature
// reads. So the plugin's own hook is taken as given and called for everyone it
// should still run for.
//
// IT IS MONKEYPATCHING, AND THE GUARD AGAINST THAT is tests/anonymous.test.ts,
// which asserts against @better-auth/stripe's own build that the hook is still
// where this reaches for it. If a version bump moves it, that test fails before
// the deploy rather than the customers arriving in Stripe afterwards.
// Deliberately structural and loose: this reaches INTO another package's
// return value, so it describes only the two properties it touches and hands
// the plugin back at its own type. Typing it against BetterAuthPlugin would
// widen the plugins array and cost `auth.options` its inference, which
// config-options.test.ts reads.
type UserCreateAfter = (user: { isAnonymous?: unknown }, ctx: never) => unknown;

type InitResult = {
  options?: { databaseHooks?: { user?: { create?: { after?: UserCreateAfter } } } };
} | undefined | void;

type PluginShape = { id?: string; init?: (ctx: never) => unknown };

export function withoutAnonymousCustomers<P extends object>(plugin: P): P {
  const source = plugin as PluginShape;
  const original = source.init;
  if (typeof original !== "function") {
    // Not a fault worth refusing a boot for - but it IS the whole guard going
    // silently missing, so it is reported rather than shrugged at.
    reportError({
      at: "auth.withoutAnonymousCustomers",
      message:
        `the ${source.id ?? "wrapped"} plugin has no init(), so its user-create ` +
        "hook could not be wrapped: an anonymous visitor may now become a " +
        "Stripe customer on their first basket touch",
    });
    return plugin;
  }

  const wrapped = {
    ...plugin,
    init(ctx: never): unknown {
      const result = original.call(plugin, ctx) as InitResult;
      const create = result?.options?.databaseHooks?.user?.create;
      const after = create?.after;
      if (!create || typeof after !== "function") {
        reportError({
          at: "auth.withoutAnonymousCustomers",
          message:
            `the ${source.id ?? "wrapped"} plugin no longer registers a ` +
            "databaseHooks.user.create.after hook. Nothing was wrapped, and an " +
            "anonymous visitor may now become a Stripe customer",
        });
        return result;
      }
      create.after = (user, hookCtx) =>
        user?.isAnonymous ? undefined : after(user, hookCtx);
      return result;
    },
  };
  return wrapped as unknown as P;
}
