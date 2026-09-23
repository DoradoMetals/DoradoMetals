import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  transpilePackages: ['@dorado/client', '@dorado/components', '@dorado/icons'],
  async redirects() {
    return [
      { source: '/privacy', destination: '/privacy-policy', permanent: true },
      { source: '/terms', destination: '/terms-and-conditions', permanent: true },
    ]
  },
}

export default withSentryConfig(nextConfig, {
  org: 'dorado-metals-exchange',
  project: 'javascript-nextjs',
  silent: !process.env.CI,
  widenClientFileUpload: true,
  webpack: {
    treeshake: { removeDebugLogging: true },
    automaticVercelMonitors: true,
  },
  authToken: process.env.NEXT_PUBLIC_SENTRY_AUTH_TOKEN,
  reactComponentAnnotation: {
    enabled: true,
  },
})
