import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  // @dorado/components ships SOURCE (no dist to drift); Next transpiles it.
  // @dorado/theme is plain CSS and needs nothing.
  transpilePackages: ['@dorado/components', '@dorado/icons'],
}

export default withSentryConfig(nextConfig, {
  org: 'dorado-metals-exchange',
  project: 'javascript-nextjs',
  silent: !process.env.CI,
  widenClientFileUpload: true,
  // Sentry 10 spellings of what disableLogger / automaticVercelMonitors said.
  webpack: {
    treeshake: { removeDebugLogging: true },
    automaticVercelMonitors: true,
  },
  authToken: process.env.NEXT_PUBLIC_SENTRY_AUTH_TOKEN,
  reactComponentAnnotation: {
    enabled: true,
  },
})
