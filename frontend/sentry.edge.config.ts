import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: 'https://2a552bd4fe2e505f285ef677b78acd50@o4509316456448000.ingest.us.sentry.io/4509316548919296',
  tracesSampleRate: 1,
  debug: false,
})
