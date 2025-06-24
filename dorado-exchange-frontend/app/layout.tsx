import type { Metadata } from 'next'
import { Montserrat, Open_Sans } from 'next/font/google'
import './styles/globals.css'
import LayoutProvider from '@/components/providers/LayoutProvider' // ✅ Import the Client Component
import { ThemeProvider } from '@/components/custom/theme/theme-provider'
import QueryProvider from '@/components/providers/QueryProvider'
import GoogleMapsProvider from '@/components/providers/GoogleMapsProvider'

import GlobalGradients from '@/components/ui/gold-gradients'
import GoogleRecaptchaProvider from '@/components/providers/GoogleRecaptchaProvider'

export const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '600', '800'],
  variable: '--font-header',
})

export const openSans = Open_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
})

export const metadata: Metadata = {
  title: 'Dorado Metals Exchange',
  description: 'Secure online platform to exchange precious metals.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${montserrat.variable} ${openSans.variable}`}
    >
      <body className="bg-background antialiased">
        <ThemeProvider attribute="class" defaultTheme="light">
          <GoogleRecaptchaProvider>
            <QueryProvider>
              <GoogleMapsProvider>
                <GlobalGradients />
                <LayoutProvider>{children}</LayoutProvider>
              </GoogleMapsProvider>
            </QueryProvider>
          </GoogleRecaptchaProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
