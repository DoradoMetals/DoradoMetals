import { requiredEnv } from "#shared/env/required.ts";
// The FedEx HTTP layer: which host, which credentials, nothing else. FEDEX_ENV chooses production (default, real labels/money) or sandbox — sandbox credentials sat unused in .env for a while; this is the code that actually wires them up.
// The sandbox is a smoke test (a human placing a real order end to end against a real carrier API), not a test dependency — FedEx's sandbox isn't reliable enough to sit inside an automated suite. Automated tests stub the provider.
import axios from "axios";
import { isTestRun } from "#shared/testing/is-test-run.ts";

// Read per call, not captured at import — a module-level const would be fixed before any test could flip FEDEX_ENV, making the switch untestable.
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

// A test run may reach the SANDBOX; it may NEVER reach LIVE. FEDEX_ENV defaults to production, so an unguarded call from a test would buy a real label against the real account — the guard refuses on the LIVE API specifically, with no override (a flag to bypass it is a flag someone flips at 2am to make a red build green).
// Every outbound FedEx request goes through fetchAccessToken/fetchTrackingToken/fedexPost/fedexPut, so this is the whole surface.
// Separately: whether the sandbox is reliable enough to sit inside the automated suite is not this guard's job — that's a scheduling decision (stub in the fast suite, sandbox in integration), not a safety one.

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
  // requiredEnv names the missing variable, never its value — without it, an unset credential reached FedEx as `undefined` and came back as a generic auth failure with no clue which of the four (sandbox x production) it was.
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
