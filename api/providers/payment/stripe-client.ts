// The Stripe SDK client — a provider, not a feature (the same distinction providers/shipments makes); features/payments owns the domain, this owns the connection.
import "#env";
import http from "node:http";
import https from "node:https";
import { isTestRun } from "#shared/testing/is-test-run.ts";
import Stripe from "stripe";

// A test run may use a test key; it may NEVER use a live one — with a live key, a test reaching createIntent charges a real card, captureIntent takes real money. Stripe's key prefix (sk_test_ / sk_live_) makes this a stronger guard than FedEx's env-var-based one.
// No override, deliberately — a flag permitting a live key in a suite is a flag someone flips to make a red build green, and what it unblocks is charging customers.
// The key is read but never logged; only its prefix is ever mentioned.
const key = process.env.STRIPE_SECRET_KEY ?? "";

// Checked once at module evaluation (the client is constructed here) through the shared isTestRun(), so it can't drift from the other providers' checks.
if (isTestRun() && key.startsWith("sk_live")) {
  throw new Error(
    "refusing to build a Stripe client with a LIVE key during a test run.\n" +
      "A test reaching this would charge a real card. Use a test key " +
      "(sk_test_...) in the environment the suite runs in."
  );
}

// TEST RUNS ONLY, RECORDING AND REPLAY BOTH (lane 4/5 -
// docs/waves/test-suite-redesign.md 2.4b). Stripe's own NodeHttpClient
// (stripe/cjs/net/NodeHttpClient.js) defers writing the request body until the
// socket's 'secureConnect' event fires - correct against a real TLS socket,
// but nock never fires that event for THIS client, in either of the two ways
// this suite uses it: nock.back's real-network pass-through
// (nock.back.setMode("update"), recording a cassette against the live
// sandbox) hands back a `MockHttpSocket` whose `connecting` flag is true and
// which never emits `secureConnect`, and a plain LOCKDOWN-mode interceptor
// (answering from an already-recorded cassette) turned out not to emit it
// either - confirmed by measurement: the first fix scoped this to
// RECORD_CASSETTES=1 only, and replay against the very cassettes just
// recorded hung the same way, all 6 network-touching tests timing out at
// vitest's 20s cap. A client that waits for the event hangs forever either
// way; the same request made with an agent that writes immediately (as axios
// does, and as the FedEx recording AND replay - providers/shipments - already
// rely on working) completes in well under a second. So this object replaces
// Stripe's default client for every test run, not only while recording -
// production is unaffected (isTestRun() is false there), and no test observes
// the write timing itself, only the response.
//
// `Stripe.HttpClient`/`HttpClientResponse` are TYPES ONLY in the SDK's .d.ts
// (declared "experimental"; there is no exported base class to extend at the
// type level even though one exists at runtime), so this is a plain object
// satisfying the interface rather than a subclass.
type NodeResponse = import("node:http").IncomingMessage;

function makeTimeoutError(): Error {
  const err = new TypeError("ETIMEDOUT") as Error & { code?: string };
  err.code = "ETIMEDOUT";
  return err;
}

function immediateWriteResponse(
  res: NodeResponse
): Stripe.HttpClientResponse<NodeResponse, NodeResponse> {
  return {
    getStatusCode: () => res.statusCode ?? 0,
    getHeaders: () => (res.headers as Record<string, string>) ?? {},
    getRawResponse: () => res,
    toStream: (streamCompleteCallback: () => void) => {
      res.once("end", streamCompleteCallback);
      return res;
    },
    toJSON: () =>
      new Promise((resolve, reject) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.once("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }),
  };
}

const immediateWriteHttpClient: Stripe.HttpClient<
  Stripe.HttpClientResponse<NodeResponse, NodeResponse>
> = {
  getClientName: () => "node-immediate-write",
  makeRequest(host, port, path, method, headers, requestData, protocol, timeout) {
    const client = protocol === "http" ? http : https;
    return new Promise((resolve, reject) => {
      const req = client.request({
        host,
        port,
        path,
        method,
        headers: headers as Record<string, string>,
      });
      req.setTimeout(timeout, () => req.destroy(makeTimeoutError()));
      req.on("response", (res) => resolve(immediateWriteResponse(res)));
      req.on("error", reject);
      req.write(requestData ?? "");
      req.end();
    });
  },
};

// API version is pinned BY THE SDK, deliberately not overridden — since stripe-node 12, omitting apiVersion sends the version the SDK's types were generated against, so wire and types agree by construction and an upgrade moves both together. Overriding it is how they'd drift apart.
const stripeClient = new Stripe(
  key,
  isTestRun() ? { httpClient: immediateWriteHttpClient } : undefined
);

export default stripeClient;
