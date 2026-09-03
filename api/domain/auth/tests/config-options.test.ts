// The options better-auth actually reads — a misspelled option is not an error or a warning, it's a key nobody reads. Two real cases: sendChangeEmailVerification was never a real option (the real name is sendChangeEmailConfirmation), so the approval mail was never sent and better-auth fell through to mailing the NEW address instead; canImpersonate was never an AdminOption either, read like a security control, and enforced nothing (the impersonate route's own adminMiddleware + hasPermission check does the real work).
// The last test generalizes: it doesn't know which options are real, it asks better-auth's own build whether it's heard of each one — what would have caught both of these on day one.

import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { auth } from "#domain/auth/client.ts";

const options = auth.options;

test("the email-change approval goes out under the name better-auth reads", () => {
  const changeEmail = options.user.changeEmail;

  assert.equal(changeEmail.enabled, true, "the flow is meant to be on");
  assert.equal(
    typeof changeEmail.sendChangeEmailConfirmation,
    "function",
    "sendChangeEmailConfirmation is the option better-auth reads - without it, " +
      "update-user.mjs falls through to the emailVerification branch and mails " +
      "the NEW address rather than asking the old one to approve"
  );
  // `in`, not `=== undefined` — converting to TypeScript turned this into a compile error naming the typo directly; asking whether the KEY is present says the same thing at runtime, a stronger claim than 'reads undefined'.
  assert.ok(
    !("sendChangeEmailVerification" in changeEmail),
    "sendChangeEmailVerification is not an option and never was - if it is " +
      "back, the approval mail is going nowhere again"
  );
});

test("no inert security option pretends to guard impersonation", () => {
  const admin = options.plugins.find((p) => p.id === "admin");
  assert.ok(admin, "the admin plugin is mounted");

  // canImpersonate is not an AdminOption. If somebody adds it back it will look
  // like the guard and do nothing, which is worse than the default that works.
  // Comments stripped first — the first version searched the raw file and failed on the comment naming the dead option to explain the fix; a check that can't tell code from prose about code fails the moment someone documents it.
  const source = fs
    .readFileSync(new URL("../client.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  assert.ok(
    /\bbetterAuth\b/.test(source),
    "the strip left no code behind - a check reading nothing accepts everything"
  );
  assert.ok(
    !/\bcanImpersonate\b/.test(source),
    "canImpersonate enforces nothing - impersonation is gated by the plugin's " +
      "own adminMiddleware and hasPermission check, with adminRoles defaulting " +
      "to [\"admin\"]"
  );
});


const betterAuthSource = (() => {
  const root = path.join(process.cwd(), "node_modules", "better-auth", "dist");
  let text = "";
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".mjs") || e.name.endsWith(".d.mts")) {
        text += fs.readFileSync(full, "utf8");
      }
    }
  };
  walk(root);
  return text;
})();

test("every option this codebase sets is one better-auth has heard of", () => {
  assert.ok(
    betterAuthSource.length > 100_000,
    `only ${betterAuthSource.length} bytes of better-auth read - the walk is wrong, ` +
      "and a check that reads nothing accepts everything"
  );

  // The option objects this codebase hands to betterAuth(), by the path they
  // sit at. Nested deliberately rather than walked wholesale: `additionalFields`
  // holds OUR column names, which better-auth has correctly never heard of.
  const configured = {
    "user.changeEmail": options.user.changeEmail,
    session: { cookieCache: options.session.cookieCache },
    emailAndPassword: options.emailAndPassword,
    emailVerification: options.emailVerification,
    advanced: options.advanced,
  };

  const unknown = [];
  let checked = 0;
  for (const [where, obj] of Object.entries(configured)) {
    for (const key of Object.keys(obj ?? {})) {
      checked += 1;
      if (!new RegExp(`\\b${key}\\b`).test(betterAuthSource)) {
        unknown.push(`${where}.${key}`);
      }
    }
  }

  assert.ok(checked > 8, `only ${checked} option(s) checked - too few to mean anything`);
  assert.deepEqual(
    unknown,
    [],
    `${unknown.length} option(s) appear nowhere in better-auth's build, which ` +
      "means nothing reads them and whatever they were meant to do is not happening"
  );
  console.log(`      ${checked} configured option(s) checked against better-auth's build`);
});
