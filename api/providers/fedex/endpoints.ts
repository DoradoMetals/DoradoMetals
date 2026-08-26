import { requiredEnv } from "#shared/env/required.ts";
// The FedEx HTTP layer: which host, which credentials, and nothing else.
//
// PRODUCTION OR SANDBOX, chosen by FEDEX_ENV. `.env` has carried a full set of
// sandbox credentials - FEDEX_SANDBOX_CLIENT_ID, _SECRET, _ACCOUNT_NUMBER and
// their tracking twins - since before this migration started, and nothing read
// any of them: every request went to FEDEX_API_URL with the live client id.
// So "point it at the sandbox" was not a configuration change, it was a code
// change, and this is it.
//
//   FEDEX_ENV=production  (default) the live API, real labels, real money
//   FEDEX_ENV=sandbox               the sandbox API and sandbox credentials
//
// The default is production because that is what every existing deployment is
// doing today, and a switch that silently redirects live traffic to a sandbox
// would be far worse than one that has to be turned on.
//
// WORTH BEING CLEAR ABOUT WHAT THE SANDBOX IS FOR. It is a smoke test - place a
// real order end to end against a real carrier API and see it work. It is not a
// test dependency: FedEx's sandbox is not reliable enough to sit inside a suite
// that is supposed to fail only when this codebase is wrong. Automated tests
// stub the provider; a human uses the sandbox.
import axios from "axios";
import { isTestRun } from "#shared/testing/is-test-run.ts";

// Read per call rather than captured at import. The first version of this
// wrote `const SANDBOX = process.env.FEDEX_ENV === "sandbox"` and claimed in a
// comment that a test could flip it - which it could not, because the value was
// already fixed by the time any test ran. A switch nothing can exercise is a
// switch nobody should trust.
const sandbox = () => process.env.FEDEX_ENV === "sandbox";

const base = () =>
  sandbox()
    ? (process.env.FEDEX_SANDBOX_API_URL ?? process.env.FEDEX_API_URL)
    : process.env.FEDEX_API_URL;

// The sandbox account number is a different account, so a caller that builds a
// shipment needs it too - builders read this rather than the variable directly.
export const accountNumber = () =>
  sandbox() ? process.env.FEDEX_SANDBOX_ACCOUNT_NUMBER : process.env.FEDEX_ACCOUNT_NUMBER;

export const trackingAccountNumber = () =>
  sandbox()
    ? process.env.FEDEX_TRACKING_SANDBOX_ACCOUNT_NUMBER
    : process.env.FEDEX_TRACKING_ACCOUNT_NUMBER;

export const activeEnvironment = () => (sandbox() ? "sandbox" : "production");
export const apiBase = base;

async function fetchOAuthToken({
  clientId,
  clientSecret,
}: {
  clientId: string;
  clientSecret: string;
}) {
  const response = await axios.post(
    base() + "/oauth/token",
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  return response.data.access_token;
}

// A TEST RUN MAY REACH THE SANDBOX. IT MAY NEVER REACH LIVE.
//
// FEDEX_ENV defaults to `production`, so an unguarded call from a test buys a
// real label against the real account - money, and a shipment somebody expects
// to receive. The hazard is the LIVE API, not FedEx as such, so the guard
// refuses on that rather than on testing.
//
//   FEDEX_ENV=sandbox     tests may call it freely
//   FEDEX_ENV=production  refused during a test run, always, no override
//
// There is deliberately no escape hatch for hitting live from a suite. A flag
// that permits it is a flag someone sets at 2am to make a red build go green.
//
// Every outbound FedEx request goes through fetchAccessToken,
// fetchTrackingToken, fedexPost or fedexPut, so this is the whole surface.
//
// A separate question this does NOT answer: whether the sandbox is dependable
// enough to sit inside the automated suite. It has not been, historically. That
// is an argument for stubbing in the fast suite and pointing integration tests
// at the sandbox, and it is a scheduling decision rather than a safety one -
// which is exactly why it is not enforced here.

function refuseInTests(what: string) {
  // Asked at call time; see shared/testing/is-test-run.ts.
  if (!isTestRun()) return;
  if ((process.env.FEDEX_ENV ?? "production") === "sandbox") return;
  throw new Error(
    `refusing to call the LIVE FedEx API (${what}) during a test run.\n` +
      `FEDEX_ENV is "${process.env.FEDEX_ENV ?? "production"}" - this would be a ` +
      `real request against the real account, buying a real label.\n` +
      `Set FEDEX_ENV=sandbox, or stub the provider.`
  );
}

export async function fetchAccessToken() {
  refuseInTests("fetchAccessToken");
  // requiredEnv NAMES THE MISSING VARIABLE AND NEVER ITS VALUE. Without it an
  // unset credential reached FedEx as `undefined` and came back as a generic
  // authentication failure, with nothing anywhere saying which of the four it
  // was - and there are four, because sandbox and production each have a pair.
  return fetchOAuthToken({
    clientId: sandbox()
      ? requiredEnv("FEDEX_SANDBOX_CLIENT_ID")
      : requiredEnv("FEDEX_CLIENT_ID"),
    clientSecret: sandbox()
      ? requiredEnv("FEDEX_SANDBOX_CLIENT_SECRET")
      : requiredEnv("FEDEX_CLIENT_SECRET"),
  });
}

export async function fetchTrackingToken() {
  refuseInTests("fetchTrackingToken");
  return fetchOAuthToken({
    clientId: sandbox()
      ? requiredEnv("FEDEX_TRACKING_SANDBOX_CLIENT_ID")
      : requiredEnv("FEDEX_TRACKING_CLIENT_ID"),
    clientSecret: sandbox()
      ? requiredEnv("FEDEX_TRACKING_SANDBOX_CLIENT_SECRET")
      : requiredEnv("FEDEX_TRACKING_CLIENT_SECRET"),
  });
}

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function fedexPost({
  token,
  path,
  payload,
}: {
  token: string;
  path: string;
  payload: unknown;
}) {
  refuseInTests(`POST ${path}`);
  const res = await axios.post(base() + path, payload, { headers: authHeaders(token) });
  return res.data;
}

export async function fedexPut({
  token,
  path,
  payload,
}: {
  token: string;
  path: string;
  payload: unknown;
}) {
  refuseInTests(`PUT ${path}`);
  const res = await axios.put(base() + path, payload, { headers: authHeaders(token) });
  return res.data;
}
