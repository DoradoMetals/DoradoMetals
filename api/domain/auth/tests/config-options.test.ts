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
  assert.ok(
    !("sendChangeEmailVerification" in changeEmail),
    "sendChangeEmailVerification is not an option and never was - if it is " +
      "back, the approval mail is going nowhere again"
  );
});

test("no inert security option pretends to guard impersonation", () => {
  const admin = options.plugins.find((p) => p.id === "admin");
  assert.ok(admin, "the admin plugin is mounted");

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

  const anonymousPlugin = options.plugins.find((p) => p.id === "anonymous");
  assert.ok(anonymousPlugin, "the anonymous plugin is mounted (ruling 63)");

  const configured = {
    "user.changeEmail": options.user.changeEmail,
    session: { cookieCache: options.session.cookieCache },
    emailAndPassword: options.emailAndPassword,
    emailVerification: options.emailVerification,
    advanced: options.advanced,
    "plugins.anonymous": anonymousPlugin.options,
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
