// RECORDED PROVIDER RESPONSES - the replay half of lane 5
// (docs/waves/test-suite-redesign.md 2.4b). `nock.back` writes one cassette
// per scenario against the real Stripe test mode and the real FedEx sandbox,
// and every later run answers from the file instead of the network.
//
// *** WHY THIS EXISTS. *** Lane 4 armed `shared/testing/no-network.ts`, which
// turned "no test drives Stripe" from a convention into a guard. It also made
// two tests impossible: the ones that DID drive Stripe stopped reaching it,
// and the Stripe SDK does not treat nock's synthetic refusal as terminal, so
// they hung instead of failing. The design's answer is a recorded response -
// the request is answered, the mapping and the row writes are exercised, and
// nothing leaves the machine.
//
// *** WHAT A CASSETTE PROVES, AND WHAT IT CANNOT. *** It proves OUR half: the
// payload the adapter builds, the mapping of the answer, the rows written, the
// idempotency key sent. It proves NOTHING about the provider - a recorded
// answer is what Stripe said in September, not what Stripe says today. That is
// `test:external`'s job, and it is why that lane exists rather than being
// replaced by this one.
//
// *** THE TWO MODES. ***
//   default        `lockdown` - the cassette answers, and a request with no
//                  cassette gets nock's own NetConnectNotAllowedError. Loud,
//                  immediate, and impossible to mistake for a passing test.
//   RECORD_CASSETTES=1
//                  `update` - the fixture is DELETED and re-recorded against
//                  the real sandboxes. nock's recorder replaces the
//                  interceptor with its own pass-through, so the lane-4 guard
//                  is bypassed for that run by nock itself rather than by
//                  anything here switching it off. FEDEX_ENV=sandbox is still
//                  required: `refuseInTests` refuses the LIVE API whatever
//                  this file does, which is the point of it.
//
// *** WHY EVERY nock.back CALL IS FOLLOWED BY A RE-ENABLE. *** Every one of
// nock.back's modes calls a bare `disableNetConnect()` in its own setup, which
// DISCARDS the loopback allowance no-network.ts installed for supertest and
// leaves an HTTP test unable to reach its own app. Restoring the allowance
// after each call is not defensive tidying: without it the update_payment_intent
// test cannot make a request at all.
//
// *** SCRUBBING. *** See tests/cassettes/README.md for the rules and for the
// one field that is deliberately left intact. Nothing recorded here is written
// to disk before `scrub()` has seen it.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import nock from "nock";

// api/tests/cassettes - a sibling of the suite rather than of any one feature,
// because a cassette is shared by the provider test that records it and the
// service test that replays it.
export const CASSETTE_DIR = path.resolve(import.meta.dirname, "..", "..", "tests", "cassettes");

export const RECORDING = process.env.RECORD_CASSETTES === "1";

// The same allowance no-network.ts installs. Duplicated as a value rather than
// imported so that importing this module cannot re-arm a guard a caller did
// not ask for.
const LOOPBACK = /^(127\.0\.0\.1|localhost)(:\d+)?$/;

const restoreLoopback = () => {
  nock.enableNetConnect(LOOPBACK);
};

// ---------------------------------------------------------------------------
// PLACEHOLDERS. Fixed strings, never derived from the value replaced - a
// truncation or a hash of a secret is still a function of the secret.
// ---------------------------------------------------------------------------
export const SCRUBBED = {
  accessToken: "SCRUBBED_ACCESS_TOKEN",
  clientId: "SCRUBBED_CLIENT_ID",
  clientSecret: "SCRUBBED_CLIENT_SECRET",
  account: "SCRUBBED_ACCOUNT_NUMBER",
  // base64 of "SCRUBBED_LABEL" - a label PNG is a quarter-megabyte of base64
  // with two addresses rendered into it, and no test reads the pixels.
  label: "U0NSVUJCRURfTEFCRUw=",
  email: "scrubbed@example.invalid",
  name: "SCRUBBED NAME",
  phone: "0000000000",
  secret: "SCRUBBED_SECRET",
  date: "SCRUBBED_DATE",
  customer: "cus_SCRUBBED",
  userId: "SCRUBBED_USER_ID",
  sessionId: "SCRUBBED_SESSION_ID",
} as const;

// ---------------------------------------------------------------------------
// NORMALISING A REQUEST BODY. Applied SYMMETRICALLY - once to what is written
// into the cassette, and again to every live request before it is matched
// against it. A value that is normalised on both sides is a value the cassette
// no longer pins, so the list is kept to two kinds of thing: a secret that
// must not be on disk, and a value that changes between two runs of the same
// scenario (a date, a fixture row's uuid).
// ---------------------------------------------------------------------------

// FedEx account numbers and the dates a payload stamps itself with. Replaced
// BY KEY rather than by matching the environment's value: a scrub that depends
// on FEDEX_SANDBOX_ACCOUNT_NUMBER being set is a scrub that silently does
// nothing on a machine where it is not.
const FEDEX_ACCOUNT_KEYS = new Set(["accountNumber", "associatedAccountNumber"]);
const FEDEX_DATE_KEYS = new Set([
  "shipDateStamp",
  "packageReadyTime",
  "readyDateTimestamp",
  "customerCloseTime",
  "scheduledDate",
]);

function normaliseFedexValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normaliseFedexValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (FEDEX_ACCOUNT_KEYS.has(key)) {
        // Both spellings FedEx uses: a bare string and { value: "..." }.
        out[key] =
          inner && typeof inner === "object" ? { value: SCRUBBED.account } : SCRUBBED.account;
      } else if (FEDEX_DATE_KEYS.has(key)) {
        out[key] = SCRUBBED.date;
      } else {
        out[key] = normaliseFedexValue(inner);
      }
    }
    return out;
  }
  return value;
}

// The OAuth form body carries the client id and secret in the clear. Nothing
// about it is worth matching on beyond the grant type, and the credentials must
// never be written, so the whole body collapses to a fixed string.
const OAUTH_BODY = `grant_type=client_credentials&client_id=${SCRUBBED.clientId}&client_secret=${SCRUBBED.clientSecret}`;

export function normaliseFedexBody(body: unknown, path?: string): unknown {
  if (path?.includes("/oauth/token")) return OAUTH_BODY;
  if (typeof body === "string") {
    try {
      return JSON.stringify(normaliseFedexValue(JSON.parse(body)));
    } catch {
      return body;
    }
  }
  return normaliseFedexValue(body);
}

// Stripe sends form-encoded bodies. Three values in them are properties of
// WHICH ROW the test happened to run as rather than of what the code sends:
// the Stripe customer id, and the two reconciliation ids the intent carries in
// its metadata (D25). The KEYS stay pinned - a payload that stopped sending
// metadata[user_id] still fails to match - only the values are dropped.
const STRIPE_VOLATILE: Record<string, string> = {
  customer: SCRUBBED.customer,
  "metadata[user_id]": SCRUBBED.userId,
  "metadata[session_id]": SCRUBBED.sessionId,
};

export function normaliseStripeBody(body: unknown): unknown {
  if (typeof body !== "string") return body;
  const params = new URLSearchParams(body);
  let touched = false;
  for (const [key, replacement] of Object.entries(STRIPE_VOLATILE)) {
    if (!params.has(key)) continue;
    params.set(key, replacement);
    touched = true;
  }
  return touched ? params.toString() : body;
}

// ---------------------------------------------------------------------------
// SCRUBBING A RESPONSE. What the provider said, with every secret and every
// piece of person-shaped data replaced before it reaches the disk.
// ---------------------------------------------------------------------------
const SECRET_RESPONSE_KEYS: Record<string, string> = {
  access_token: SCRUBBED.accessToken,
  refresh_token: SCRUBBED.accessToken,
  encodedLabel: SCRUBBED.label,
  emailAddress: SCRUBBED.email,
  email: SCRUBBED.email,
  personName: SCRUBBED.name,
  phoneNumber: SCRUBBED.phone,
};

function scrubValue(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) return value.map((v) => scrubValue(v));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, inner] of Object.entries(value as Record<string, unknown>)) {
      out[k] = scrubValue(inner, k);
    }
    return out;
  }
  if (typeof value !== "string" || key === undefined) return value;

  const replacement = SECRET_RESPONSE_KEYS[key];
  if (replacement !== undefined) return replacement;

  // A Stripe client_secret is the browser's authority to confirm the intent.
  // Its PREFIX is the intent id, which several call sites read, so the prefix
  // survives and only the authority itself is replaced.
  if (key === "client_secret" && value.includes("_secret_")) {
    return `${value.split("_secret_")[0]}_secret_${SCRUBBED.secret}`;
  }
  // `name` is a person on a Stripe customer and a service name on a FedEx
  // rate, so it is scrubbed by SHAPE rather than by key: only where the
  // surrounding object is a customer does the key mean a person, and the
  // customer object is the only place Stripe returns one.
  return value;
}

// A Stripe customer object carries the name and email this codebase opened it
// with. Handled separately from the key map because `name` collides with
// FedEx's service names.
function scrubStripeCustomer(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubStripeCustomer);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, inner] of Object.entries(record)) {
    out[k] = scrubStripeCustomer(inner);
  }
  if (record.object === "customer") {
    if ("name" in out) out.name = SCRUBBED.name;
    if ("email" in out) out.email = SCRUBBED.email;
    if ("description" in out && typeof out.description === "string") out.description = SCRUBBED.name;
  }
  if (record.object === "billing_details" || record.object === "shipping") {
    if ("name" in out) out.name = SCRUBBED.name;
  }
  return out;
}

// ---------------------------------------------------------------------------
// CONTENT ENCODING. axios asks for gzip, so nock records FedEx's answers as an
// array of hex chunks - which no scrubber can read and no reviewer can diff.
// Decoding them here and storing plain JSON is what makes the "committed,
// because it is scrubbed" answer true rather than aspirational: an unreadable
// cassette is an unscrubbable one.
// ---------------------------------------------------------------------------
function decodeResponse(def: RecordedDefinition): unknown {
  const encoding = String(headerValue(def.rawHeaders, "content-encoding") ?? "").toLowerCase();
  const response = def.response;
  if (!encoding || !Array.isArray(response)) return response;

  const buffer = Buffer.concat(response.map((chunk) => Buffer.from(String(chunk), "hex")));
  let decoded: Buffer;
  if (encoding.includes("br")) decoded = zlib.brotliDecompressSync(buffer);
  else if (encoding.includes("gzip")) decoded = zlib.gunzipSync(buffer);
  else if (encoding.includes("deflate")) decoded = zlib.inflateSync(buffer);
  else return response;

  const text = decoded.toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function headerValue(
  headers: Record<string, string | string[]> | undefined,
  name: string
): string | string[] | undefined {
  if (!headers) return undefined;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name) return value;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// THE RECORDING PASS.
// ---------------------------------------------------------------------------
type RecordedDefinition = nock.Definition & {
  response?: unknown;
  responseIsBinary?: boolean;
  filteringRequestBody?: (body: string, recorded: unknown) => string;
};

const isLoopback = (scope: string | RegExp) =>
  typeof scope === "string" && /(127\.0\.0\.1|localhost)/.test(scope);

export function scrub(defs: RecordedDefinition[]): RecordedDefinition[] {
  return defs
    // supertest talks to the app over real loopback HTTP, and the recorder
    // records every socket in the process. Those are the harness, not the
    // provider.
    .filter((def) => !isLoopback(def.scope))
    .map((def) => {
      const isFedex = String(def.scope).includes("fedex.com");
      const decoded = decodeResponse(def);
      const scrubbed = scrubStripeCustomer(scrubValue(decoded));

      const contentType = headerValue(def.rawHeaders, "content-type");
      return {
        scope: def.scope,
        method: def.method,
        path: def.path,
        body: isFedex
          ? (normaliseFedexBody(def.body, String(def.path)) as nock.Definition["body"])
          : (normaliseStripeBody(def.body) as nock.Definition["body"]),
        status: def.status,
        response: scrubbed,
        // ONE header survives, and it is the one nock needs to hand the body
        // back as JSON. Everything else - request ids, rate-limit counters,
        // Stripe's echo of the idempotency key, any Set-Cookie - is dropped
        // rather than scrubbed, because a header nobody asserts on is a
        // header with nothing to lose.
        rawHeaders: contentType
          ? { "content-type": Array.isArray(contentType) ? contentType[0]! : contentType }
          : { "content-type": "application/json" },
      } as RecordedDefinition;
    });
}

// The other half of the symmetry: the same normalisation, applied to the LIVE
// request before nock compares it with what the cassette holds.
function applyMatchers(def: RecordedDefinition): void {
  const isFedex = String(def.scope).includes("fedex.com");
  def.filteringRequestBody = (body: string) => {
    const normalised = isFedex
      ? normaliseFedexBody(body, String(def.path))
      : normaliseStripeBody(body);
    return typeof normalised === "string" ? normalised : JSON.stringify(normalised);
  };
}

let modeSet = false;

function ensureMode(): void {
  if (modeSet) return;
  nock.back.fixtures = CASSETTE_DIR;
  nock.back.setMode(RECORDING ? "update" : "lockdown");
  modeSet = true;
  restoreLoopback();
}

/**
 * Runs `fn` with `<provider>/<name>.json` answering every outbound request.
 *
 * In the default lane the cassette must exist: a missing one is a hard failure
 * naming the file and the command that records it, rather than a request that
 * silently escapes.
 */
export async function withCassette<T>(name: string, fn: () => Promise<T>): Promise<T> {
  ensureMode();

  const fixture = path.join(CASSETTE_DIR, name);
  if (!RECORDING && !fs.existsSync(fixture)) {
    throw new Error(
      `nock.back lockdown: no cassette at ${fixture}.\n` +
        `Nothing will answer this scenario's requests and nothing may reach the ` +
        `network. Record it with:\n` +
        `  pnpm --filter @dorado/api test:record`
    );
  }

  const { nockDone } = await nock.back(name, {
    before: applyMatchers,
    afterRecord: scrub as (defs: nock.Definition[]) => nock.Definition[],
    recorder: {
      // Never record a request header. `Authorization: Bearer <sk_test_...>`
      // and FedEx's own bearer token are request headers, so the cheapest
      // possible scrub is not to capture them at all - and nock's default is
      // already this. Stated rather than inherited, because the day it changes
      // is the day a live key lands in a committed file.
      enable_reqheaders_recording: false,
    },
  });
  // nock.back's own setup discarded the loopback allowance - see this file's
  // header.
  restoreLoopback();

  try {
    return await fn();
  } finally {
    nockDone();
    nock.cleanAll();
    restoreLoopback();
  }
}
