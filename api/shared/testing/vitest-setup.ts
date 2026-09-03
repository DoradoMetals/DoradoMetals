// vitest's `setupFiles` equivalent of the old `node --import
// ./shared/testing/no-network.ts` preload (docs/waves/test-suite-redesign.md,
// lane 3/lane 4). Runs before each test file's own imports, in every worker,
// so the network guard is armed before a test could outrun it by importing
// Stripe or axios first - the same guarantee `--import` gave, just wired
// through vitest's own hook instead of a node CLI flag.
//
// TZ/NODE_ENV/USE_TEST_DB are NOT set here. vitest.config.ts's `test.env`
// carries them into every forked worker (computed once, from the same
// `env.ts` the rest of the app uses) - duplicating them here would just be a
// second place for the two to drift apart.
import "#shared/testing/no-network.ts";
