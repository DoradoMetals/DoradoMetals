// Is this process a test run?
//
// Asked by the three guards that stop a test reaching a live third party: the
// mail transport, the FedEx client and the Stripe client.
//
// EVALUATED WHEN ASKED, NEVER CACHED, and that is the whole point of this file.
// Each guard used to compute this once at module scope:
//
//   const looksLikeATestRun = process.env.NODE_ENV === "test" || ...
//
// which is wrong in a way that took a real send to notice. ES module imports
// are HOISTED, so a script whose first statement is
//
//   process.env.NODE_ENV = "test"
//
// sets it AFTER every imported module has already evaluated. The guard had
// captured `undefined`, decided this was not a test, and built the real
// transport. scripts/seed-e2e-users.mjs did exactly that and reached Gmail -
// it failed on credentials rather than on the guard, which is luck, not design.
//
// A function reads the environment at the moment mail is about to leave, which
// is the only moment the answer matters.
//
// DETECTED TWO WAYS, because either alone can be defeated. NODE_ENV is what the
// test scripts set deliberately; node's own --test-* flags in execArgv catch
// `node --test some.test.js` run by hand, where NODE_ENV may be unset.
export function isTestRun(): boolean {
  return (
    process.env.NODE_ENV === "test" ||
    process.execArgv.some((a) => a.startsWith("--test"))
  );
}
