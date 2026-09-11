import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './styles/globals.css'
import LayoutProvider from '@/shared/providers/LayoutProvider'
import { AppShell } from '@/shared/ui/AppShell'
import { ThemeProvider } from '@/shared/providers/ThemeProvider'
import QueryProvider from '@/shared/providers/QueryProvider'
import GoogleMapsProvider from '@/shared/providers/GoogleMapsProvider'

import GoogleRecaptchaProvider from '@/shared/providers/GoogleRecaptchaProvider'

// GEIST, ONE FAMILY (brand refresh, 2026-08-30). Every text style in the Figma
// library is Geist; Montserrat, Open Sans and Poppins are the old brand. Both
// CSS variables survive - typography.css hangs headings off --font-header and
// body off --font-sans - they simply resolve to the same family now, at the
// weights the drawings use (400 body, 500 chrome, 600 headings; variable font,
// so no weight list). Geist Mono takes the numeric/mono slot from the
// ui-monospace stack.
const geist = Geist({
  subsets: ['latin'],
  variable: '--font-sans',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono-loaded',
})

export const metadata: Metadata = {
  title: 'Dorado Metals Exchange',
  description: 'Secure online platform to exchange precious metals.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geist.variable} ${geistMono.variable}`}>
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
                <LayoutProvider>
                  <AppShell>{children}</AppShell>
                </LayoutProvider>
              </GoogleMapsProvider>
            </QueryProvider>
          </GoogleRecaptchaProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
