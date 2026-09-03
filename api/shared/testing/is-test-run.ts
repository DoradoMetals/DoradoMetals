// Is this process a test run? Asked by the three guards that stop a test reaching a live third party (mail, FedEx, Stripe).
// Evaluated when asked, never cached — ES module imports are hoisted, so a script setting `process.env.NODE_ENV = "test"` as its first statement still runs after every import has already evaluated. A module-scope check once captured undefined, decided this wasn't a test, and built a real transport — scripts/seed-e2e-users.mjs reached Gmail that way (failed on credentials, not the guard — luck, not design).
// Detected two ways since either alone can be defeated: NODE_ENV (set deliberately by test scripts) and node's own --test-* execArgv (catches `node --test x.js` run by hand, where NODE_ENV may be unset).
export function isTestRun(): boolean {
  return (
    process.env.NODE_ENV === "test" ||
    process.execArgv.some((a) => a.startsWith("--test"))
  );
}
