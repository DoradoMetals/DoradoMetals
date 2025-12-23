import type { Metadata } from 'next'
import { Montserrat, Open_Sans, Poppins } from 'next/font/google'
import './styles/globals.css'
import LayoutProvider from '@/providers/LayoutProvider' // ✅ Import the Client Component
import { ThemeProvider } from '@/providers/ThemeProvider'
import QueryProvider from '@/providers/QueryProvider'
import GoogleMapsProvider from '@/providers/GoogleMapsProvider'

import GoogleRecaptchaProvider from '@/providers/GoogleRecaptchaProvider'

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
        <ThemeProvider attribute="class" defaultTheme="light">
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
