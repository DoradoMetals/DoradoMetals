import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  // @dorado/components ships SOURCE (no dist to drift); Next transpiles it.
  // @dorado/theme is plain CSS and needs nothing.
  transpilePackages: ['@dorado/components'],
}

export default withSentryConfig(nextConfig, {
  org: 'dorado-metals-exchange',
  project: 'javascript-nextjs',
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  automaticVercelMonitors: true,
  authToken: process.env.NEXT_PUBLIC_SENTRY_AUTH_TOKEN,
  reactComponentAnnotation: {
    enabled: true,
  },
})
