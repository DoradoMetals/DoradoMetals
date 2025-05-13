import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true, // ✅ Skip ESLint during `next build`
  },
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
