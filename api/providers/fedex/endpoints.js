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

async function fetchOAuthToken({ clientId, clientSecret }) {
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

export async function fetchAccessToken() {
  return fetchOAuthToken({
    clientId: sandbox() ? process.env.FEDEX_SANDBOX_CLIENT_ID : process.env.FEDEX_CLIENT_ID,
    clientSecret: sandbox()
      ? process.env.FEDEX_SANDBOX_CLIENT_SECRET
      : process.env.FEDEX_CLIENT_SECRET,
  });
}

export async function fetchTrackingToken() {
  return fetchOAuthToken({
    clientId: sandbox()
      ? process.env.FEDEX_TRACKING_SANDBOX_CLIENT_ID
      : process.env.FEDEX_TRACKING_CLIENT_ID,
    clientSecret: sandbox()
      ? process.env.FEDEX_TRACKING_SANDBOX_CLIENT_SECRET
      : process.env.FEDEX_TRACKING_CLIENT_SECRET,
  });
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function fedexPost({ token, path, payload }) {
  const res = await axios.post(base() + path, payload, { headers: authHeaders(token) });
  return res.data;
}

export async function fedexPut({ token, path, payload }) {
  const res = await axios.put(base() + path, payload, { headers: authHeaders(token) });
  return res.data;
}
