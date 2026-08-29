// requiredEnv is what three secrets are read through - the reCAPTCHA secret,
// the Stripe webhook secret and the FedEx credentials - so its discipline is a
// security property, not a convenience: THE MESSAGE NAMES THE VARIABLE AND
// NEVER ITS VALUE. A missing secret has to be diagnosable from a log nobody had
// to redact.
//
// The other behaviour worth holding is that it refuses an EMPTY string. That is
// not obvious from the name: an operator who sets a variable to "" in Railway
// has set it, and this treats that as missing. It is the right answer - "" as a
// reCAPTCHA secret fails the same way `undefined` did - but it is a decision,
// so it is pinned rather than left to the truthiness of `!value`.
import test from "node:test";
import assert from "node:assert/strict";
import { requiredEnv } from "#shared/env/required.ts";

const withEnv = <T>(name: string, value: string | undefined, fn: () => T): T => {
  const had = Object.prototype.hasOwnProperty.call(process.env, name);
  const before = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try { return fn(); } finally {
    if (had) process.env[name] = before;
    else delete process.env[name];
  }
};

const NAME = "DORADO_REQUIRED_ENV_FIXTURE";

test("returns the value when it is set", () => {
  withEnv(NAME, "a-value", () => {
    assert.equal(requiredEnv(NAME), "a-value");
  });
});

test("throws when it is unset, and the message names the variable", () => {
  withEnv(NAME, undefined, () => {
    assert.throws(() => requiredEnv(NAME), (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, new RegExp(NAME));
      return true;
    });
  });
});

test("an empty string counts as missing, not as a value", () => {
  withEnv(NAME, "", () => {
    assert.throws(() => requiredEnv(NAME), new RegExp(NAME));
  });
});

// The security property, asserted rather than assumed. A secret that reaches an
// exception reaches every log and error reporter downstream of it - so this
// checks the message against the value that was actually set, including the
// case where the value is only whitespace and the throw fires anyway.
test("the message never carries the value", () => {
  const secret = "sk_live_THIS_MUST_NEVER_APPEAR";
  withEnv(NAME, secret, () => {
    assert.equal(requiredEnv(NAME), secret);
  });
  // and on the failing path there is nothing to leak, because the only values
  // that throw are the ones with no content
  for (const empty of ["", undefined]) {
    withEnv(NAME, empty, () => {
      try { requiredEnv(NAME); assert.fail("should have thrown"); }
      catch (err) {
        assert.ok(err instanceof Error);
        assert.doesNotMatch(err.message, /sk_live/);
      }
    });
  }
});

test("each variable is read by name, not cached from a previous call", () => {
  withEnv(NAME, "first", () => assert.equal(requiredEnv(NAME), "first"));
  withEnv(NAME, "second", () => assert.equal(requiredEnv(NAME), "second"));
});
