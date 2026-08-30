// Sentry for the Node runtime, which was never initialised.
//
// *** WHAT WAS BROKEN. *** `instrumentation.ts` exported
// `Sentry.captureRequestError` as `onRequestError`, and `next.config.ts` wraps
// the config in `withSentryConfig` - so it LOOKED wired. It was not.
// `withSentryConfig` is a build-time bundler plugin: it uploads source maps and
// injects release metadata. It does not initialise the SDK at runtime. Next
// initialises the server SDK by calling the `register()` export of
// `instrumentation.ts`, and there was no `register()` anywhere in this app.
//
// So `Sentry.init()` never ran in the Node runtime, `captureRequestError` fired
// into an SDK with no client, and **every server component, route handler and
// SSR error went unreported** - while browser errors arrived normally, which is
// why the dashboard looked healthy. The half of the frontend that talks to the
// API was the unmonitored half.
//
// The DSN is the same one `instrumentation-client.ts` already carries. A Sentry
// DSN is a public ingest key by design - it is not the auth token, which is
// build-time only and is a write credential (see FOLLOWUPS D192).
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://2a552bd4fe2e505f285ef677b78acd50@o4509316456448000.ingest.us.sentry.io/4509316548919296",

  // Matches instrumentation-client.ts. Worth revisiting together rather than
  // separately: 1.0 on the server samples every request trace, and the server
  // sees more traffic than the browser does.
  tracesSampleRate: 1,

  debug: false,
});
