// AES-256-GCM envelope encryption for the two columns that hold bank details. Written because migration 073 and verify-backfill.mjs both cited a script to write encrypted numbers into payments.details that was never actually built — production stayed plaintext. This is the half with no database in it, testable exhaustively against synthetic values.
// NOTHING IN HERE LOGS, THROWS WITH, OR EMBEDS A PLAINTEXT VALUE — every error message describes the FAILURE, never the INPUT, so a stack trace from this file is safe to paste into a ticket. envelope.test.ts asserts that for every throw.
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

// v1 is AES-256-GCM, 12-byte IV, 16-byte tag — versioned so a future cipher is a parse, not a guess: a v2 reader knows on sight which rows need rotating first.
const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

// '.' can't appear in base64 or a constrained key id, so it's a safe field separator — see assertKeyId.
const SEPARATOR = ".";
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export type Key = { id: string; bytes: Buffer };

export class EnvelopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvelopeError";
  }
}

function assertKeyId(id: string): void {
  if (!KEY_ID_PATTERN.test(id)) {
    throw new EnvelopeError(
      `key id must match ${KEY_ID_PATTERN} - it is stored inside the envelope ` +
      `and used as a field separator boundary, so it cannot contain '.'`
    );
  }
}

// A key arrives as base64 from the environment, never a literal — must decode to exactly 32 bytes; AES-256 silently accepts anything else, and a short key produces working ciphertext at a fraction of the intended strength.
export function parseKey(id: string, base64: string): Key {
  assertKeyId(id);
  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64, "base64");
  } catch {
    throw new EnvelopeError("key is not valid base64");
  }
  if (bytes.length !== KEY_BYTES) {
    throw new EnvelopeError(
      `key must be ${KEY_BYTES} bytes (${KEY_BYTES * 8}-bit) once base64-decoded, ` +
      `got ${bytes.length}. Generate one with: ` +
      `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
    );
  }
  return { id, bytes };
}

// AAD binds a ciphertext to the row and column it belongs to. Moving a sealed
// routing number onto another customer's row, or into the account-number
// column, fails authentication rather than decrypting into the wrong life.
export function aadFor(rowId: string, column: string): Buffer {
  return Buffer.from(`${rowId}:${column}`, "utf8");
}

export function seal(
  plaintext: string, key: Key, aad: Buffer
): string {
  if (plaintext.length === 0) {
    throw new EnvelopeError("refusing to seal an empty value - a caller that " +
      "reached here with '' has almost certainly read a NULL column and " +
      "coerced it, which would store a valid envelope over a missing secret");
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key.bytes, iv, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    key.id,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(SEPARATOR);
}

// The key id WITHOUT decrypting, for rotation planning and for the audit that
// asks "which rows are still under the old key" when the column is unavailable.
export function keyIdOf(envelope: string): string {
  const parts = envelope.split(SEPARATOR);
  if (parts.length !== 5 || parts[0] !== VERSION) {
    throw new EnvelopeError(
      `not a ${VERSION} envelope: expected 5 '${SEPARATOR}'-separated fields, ` +
      `got ${parts.length}`
    );
  }
  return parts[1]!;
}

export function isEnvelope(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  try {
    keyIdOf(value);
    return true;
  } catch {
    return false;
  }
}

export function open(
  envelope: string, key: Key, aad: Buffer
): string {
  const parts = envelope.split(SEPARATOR);
  if (parts.length !== 5 || parts[0] !== VERSION) {
    throw new EnvelopeError(
      `not a ${VERSION} envelope: expected 5 '${SEPARATOR}'-separated fields, ` +
      `got ${parts.length}`
    );
  }
  const [, keyId, ivB64, tagB64, ctB64] = parts as [string, string, string, string, string];

  // Compared before use so a row sealed under a rotated key reports THAT rather than an indistinguishable auth failure — timing-safe since a key id could be attacker-influenceable if ever taken from input.
  const want = Buffer.from(keyId, "utf8");
  const have = Buffer.from(key.id, "utf8");
  if (want.length !== have.length || !timingSafeEqual(want, have)) {
    throw new EnvelopeError(
      `envelope was sealed under key '${keyId}' and the key supplied is ` +
      `'${key.id}' - rotate, or supply the key it was sealed under`
    );
  }

  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  if (iv.length !== IV_BYTES) {
    throw new EnvelopeError(`iv must be ${IV_BYTES} bytes, got ${iv.length}`);
  }
  if (tag.length !== TAG_BYTES) {
    throw new EnvelopeError(`tag must be ${TAG_BYTES} bytes, got ${tag.length}`);
  }

  const decipher = createDecipheriv(ALGORITHM, key.bytes, iv, {
    authTagLength: TAG_BYTES,
  });
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // GCM's own message is "Unsupported state or unable to authenticate data",
    // which tells an operator nothing about which of the three causes it was.
    throw new EnvelopeError(
      "authentication failed: the ciphertext, the tag, the key or the row/column " +
      "binding does not match what this value was sealed with. The value was " +
      "NOT decrypted and nothing has been logged."
    );
  }
}
