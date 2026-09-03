// THE EXTERNAL LANE, reserved. `pnpm test:external` runs `node --test` here
// WITHOUT `shared/testing/no-network.ts` preloaded (see the `test` script for
// the lane that does) - the one lane in this suite allowed to reach a real
// third party.
//
// EMPTY OF TESTS ON PURPOSE, FOR NOW (docs/waves/test-suite-redesign.md, lane
// 4's own header says so). Two things already reach real providers and
// neither belongs here yet:
//   - `sandbox/*.sandbox.js`, run by the pre-existing `test:sandbox` script -
//     a human-run smoke test against FedEx/Stripe sandboxes, not part of any
//     gate.
//   - The cassette-recorded Stripe/FedEx success paths lane 5 ("replay") is
//     designed to add, and the TypeScript sandbox conversion lane 6 ("the
//     sandbox lane") is designed to wire to a nightly run.
// When either lands here, this file's only remaining job is to explain why
// the directory exists at all - a directory with nothing in it is not
// evidence anyone read this far, so the placeholder stays until a real
// `*.test.ts` file joins it. This file's own name does not match `*.test.ts`
// (or `*-test.ts`) on purpose - node's test runner does not pick it up, so
// `test:external` reports zero tests rather than one that does nothing.
export {};
