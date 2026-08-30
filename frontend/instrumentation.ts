// The hook Next calls once per runtime at startup, and the reason server-side
// Sentry now works.
//
// This file used to be three lines: it imported Sentry and re-exported
// `captureRequestError`. That export is the error HOOK; it is not
// initialisation. Without a `register()` the SDK was never started in the Node
// or edge runtime, so the hook reported into nothing and only browser errors
// reached Sentry. See sentry.server.config.ts.
//
// The imports are dynamic and inside the runtime check on purpose: the edge
// runtime cannot load the Node build of the SDK, so importing both eagerly
// fails the edge bundle.
import * as Sentry from "@sentry/nextjs";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
