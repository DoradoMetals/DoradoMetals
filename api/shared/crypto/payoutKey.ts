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
