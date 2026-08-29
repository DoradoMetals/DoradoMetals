// RECAPTCHA_THRESHOLD, and the silent lockout it used to be able to cause.
//
// The old expression was `parseFloat(process.env.RECAPTCHA_THRESHOLD || '0.5')`,
// which reads as though it has a default. It does, but only for UNSET. A value
// that is present and unreadable parses to NaN, and `score >= NaN` is false for
// every score there is - so every human is refused, the API answers a
// completely ordinary `false`, and nothing anywhere says why.
//
// The first test below is the control: it demonstrates the old expression
// really did produce that, rather than my asserting it did.

import test from "node:test";
import assert from "node:assert/strict";

import { scoreThreshold } from "#providers/captcha/recaptcha.ts";

const withThreshold = <T>(value: string | undefined, fn: () => T): T => {
  const had = Object.prototype.hasOwnProperty.call(process.env, "RECAPTCHA_THRESHOLD");
  const previous = process.env.RECAPTCHA_THRESHOLD;
  if (value === undefined) delete process.env.RECAPTCHA_THRESHOLD;
  else process.env.RECAPTCHA_THRESHOLD = value;
  try {
    return fn();
  } finally {
    if (had) process.env.RECAPTCHA_THRESHOLD = previous;
    else delete process.env.RECAPTCHA_THRESHOLD;
  }
};

// Warnings are expected in one of these tests. Capturing rather than silencing,
// because what the warning says is itself asserted.
const capturingWarnings = (fn: () => void): string[] => {
  const lines: string[] = [];
  const original = console.warn;
  console.warn = (...args) => lines.push(args.join(" "));
  try {
    fn();
  } finally {
    console.warn = original;
  }
  return lines;
};

test("THE CONTROL: the old expression failed in both directions, silently", () => {
  const old = (raw: string | undefined) => parseFloat(raw || "0.5");

  assert.equal(old(undefined), 0.5, "unset was fine - that is why this looked safe");
  assert.equal(old("0.7"), 0.7, "a good value was fine too");

  // Direction one: unreadable -> NaN -> nobody gets in.
  const nan = old("high");
  assert.ok(Number.isNaN(nan), "a malformed value parsed to NaN");
  assert.equal(1.0 >= nan, false, "a score of 1.0 - a certain human - did not clear NaN");
  assert.equal(0.0 >= nan, false);

  // Direction two, and the worse one: a decimal comma parses to ZERO. It is a
  // perfectly finite number, so nothing treated it as an error, and a threshold
  // of zero is cleared by every score there is. The captcha was off, and it
  // looked exactly like a captcha that worked.
  const zero = old("0,7");
  assert.equal(zero, 0, "parseFloat stopped at the comma and kept the 0");
  assert.ok(Number.isFinite(zero), "which means no NaN check would have caught it");
  assert.equal(0.0 >= zero, true, "a score of 0.0 - a bot - cleared it");
});

test("unset takes Google's recommended default", () => {
  assert.equal(withThreshold(undefined, scoreThreshold), 0.5);
});

test("a readable value is used as given", () => {
  assert.equal(withThreshold("0.7", scoreThreshold), 0.7);
  assert.equal(withThreshold("0.9", scoreThreshold), 0.9);
  assert.equal(withThreshold("0", scoreThreshold), 0, "zero is a real threshold, not a missing one");
});

const thresholdFor = (raw: string | undefined): number =>
  withThreshold(raw, () => {
    let result: number | undefined;
    capturingWarnings(() => {
      result = scoreThreshold();
    });
    // The compiler cannot see that `capturingWarnings` calls its argument
    // synchronously, and neither could a reader. Stating it as a refusal costs
    // one line and turns "compared against undefined" into a named failure.
    if (result === undefined) throw new Error("capturingWarnings did not run its callback");
    return result;
  });

test("an unreadable value falls back instead of refusing every human", () => {
  for (const bad of ["high", "abc", "", " ", "NaN", "Infinity"]) {
    const value = thresholdFor(bad);
    assert.equal(value, 0.5, `"${bad}" should fall back to 0.5`);
    assert.ok(Number.isFinite(value), "the fallback must be a real number");
  }
});

test("a PARTIALLY readable value falls back too - this is the one that was live", () => {
  // parseFloat read "0,7" as 0 and disabled the captcha. Number() refuses it.
  for (const bad of ["0,7", "0.7abc", "1,0", "0.5 0.9"]) {
    assert.equal(thresholdFor(bad), 0.5, `"${bad}" must not be read as a partial number`);
  }
});

test("a value outside 0..1 falls back - no v3 score can be in that range", () => {
  for (const bad of ["5", "-1", "100", "1.5"]) {
    assert.equal(thresholdFor(bad), 0.5, `"${bad}" is not a reachable score`);
  }
  // The ends of the range are legitimate, however.
  assert.equal(thresholdFor("0"), 0, "0 accepts everything, but it is a choice someone can make");
  assert.equal(thresholdFor("1"), 1, "1 accepts only a certain human, but it is a choice too");
});

test("the warning names the variable and does not print what it holds", () => {
  const secretish = "definitely-not-a-number-9f3a1c";
  const lines = withThreshold(secretish, () => capturingWarnings(() => scoreThreshold()));

  assert.equal(lines.length, 1, "exactly one warning");
  assert.match(lines[0], /RECAPTCHA_THRESHOLD/, "it names the variable");
  assert.ok(
    !lines[0].includes(secretish),
    "the warning must NOT contain the value - this is the habit that keeps a " +
      "misconfigured secret out of the logs, and a threshold is where it is cheap to keep"
  );
});

test("a readable value warns about nothing", () => {
  const lines = withThreshold("0.7", () => capturingWarnings(() => scoreThreshold()));
  assert.deepEqual(lines, [], "the normal path must be quiet");
});
