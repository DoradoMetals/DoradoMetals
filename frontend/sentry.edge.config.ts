// Sentry for the edge runtime - middleware and any `export const runtime =
// "edge"` route. Separate from sentry.server.config.ts because the edge runtime
// is a different JavaScript environment with its own module instances: one
// init does not cover both.
//
// See sentry.server.config.ts for why neither was running until now.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://2a552bd4fe2e505f285ef677b78acd50@o4509316456448000.ingest.us.sentry.io/4509316548919296",
  tracesSampleRate: 1,
  debug: false,
});
