// THE OPTIONS BETTER-AUTH ACTUALLY READS.
//
// betterAuth() takes a plain object. An option spelled wrongly is not an
// error, not a warning and not a log line - it is a key nobody reads, and the
// behaviour it was meant to produce simply never happens. Two of them were
// sitting in features/auth/client.js:
//
//   sendChangeEmailVerification  - there has never been an option by this
//     name. The real one is sendChangeEmailConfirmation. So the "Approve Email
//     Change" mail was never sent to anybody, and better-auth fell through to
//     the ordinary verification branch, which mails the NEW address instead of
//     the old one. frontend/app/change-email/page.tsx exists for a link that
//     was never sent.
//
//   canImpersonate  - never an AdminOption either. It read like a security
//     control and enforced nothing. Nothing was exposed by it: the impersonate
//     route carries adminMiddleware and its own hasPermission check, which is
//     what the dead option was trying to say.
//
// The last test is the one that generalises. It does not know which options
// are real; it asks better-auth's own build whether it has ever heard of each
// one. That is what would have caught both of these on the day they were
// written.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { auth } from "#features/auth/client.ts";

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
  // `in`, NOT `=== undefined`. Converting this file to TypeScript turned the
  // assertion into a compile error - "Property 'sendChangeEmailVerification'
  // does not exist ... Did you mean 'sendChangeEmailConfirmation'?" - which is
  // better-auth's own types agreeing with the test. Asking whether the KEY is
  // present says the same thing at runtime, is a stronger claim than "reads
  // undefined", and keeps the compiler's version of the answer as well.
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
  // COMMENTS STRIPPED FIRST. The first version of this searched the raw file
  // and failed on the comment above the fix, which names the dead option four
  // times to explain it. A check that cannot tell code from prose about code
  // fails the moment somebody documents the thing it is checking for.
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

// ---------------------------------------------------------------------------
// The general one.

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
