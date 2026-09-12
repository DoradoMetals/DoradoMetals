import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './styles/globals.css'
import LayoutProvider from '@/shared/providers/LayoutProvider'
import { AppShell } from '@/shared/ui/AppShell'
import { ThemeProvider } from '@/shared/providers/ThemeProvider'
import QueryProvider from '@/shared/providers/QueryProvider'
import GoogleMapsProvider from '@/shared/providers/GoogleMapsProvider'

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
        <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark">
          <QueryProvider>
            <GoogleMapsProvider>
              <LayoutProvider>
                <AppShell>{children}</AppShell>
              </LayoutProvider>
            </GoogleMapsProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
