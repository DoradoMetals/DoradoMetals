import type { Metadata } from 'next'
import { Montserrat, Open_Sans, Poppins } from 'next/font/google'
import './styles/globals.css'
import LayoutProvider from '@/shared/providers/LayoutProvider' // ✅ Import the Client Component
import { ThemeProvider } from '@/shared/providers/ThemeProvider'
import QueryProvider from '@/shared/providers/QueryProvider'
import GoogleMapsProvider from '@/shared/providers/GoogleMapsProvider'

import GoogleRecaptchaProvider from '@/shared/providers/GoogleRecaptchaProvider'

export const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '600', '800'],
  variable: '--font-header',
})

export const openSans = Open_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
})

export const poppins = Poppins({
  subsets: ['latin'],
  weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
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
      className={`${montserrat.variable} ${poppins.variable}`}
    >
      <body className="bg-background antialiased">
        {/* Light mode is gone (app/styles/theme.css: ":root" IS the dark
            palette, and the `dark:` variant always matches). `forcedTheme`
            pins it so a stale `theme` in a returning visitor's localStorage
            cannot put the app back into a mode that no longer has a palette.
            The provider itself survives only because next-themes owns the
            no-flash inline script; the toggle UI is deleted. */}
        <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark">
          <GoogleRecaptchaProvider>
            <QueryProvider>
              <GoogleMapsProvider>
                <LayoutProvider>{children}</LayoutProvider>
              </GoogleMapsProvider>
            </QueryProvider>
          </GoogleRecaptchaProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
