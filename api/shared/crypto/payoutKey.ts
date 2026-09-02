// The one place the live path loads the payout key from the environment.
//
// scripts/encrypt-payout-details.ts has its own copy of this ceremony because
// it predates the LIVE need; the payout step (D210) makes the key
// load-bearing at checkout time, so the load lives here where both the write
// (payments/details) and the admin read can share it. Refuses loudly and
// WITHOUT the value, exactly as the script does: a missing or short key is a
// deploy fault, and the error must be safe to paste anywhere.
import { parseKey, type Key } from "#shared/crypto/envelope.ts";

export function payoutKeyFromEnv(): Key {
  const raw = process.env.PAYOUT_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "PAYOUT_ENCRYPTION_KEY is not set - bank details cannot be stored. " +
        "Set the base64 32-byte key before serving the payout step."
    );
  }
  return parseKey(process.env.PAYOUT_ENCRYPTION_KEY_ID ?? "k1", raw);
}
