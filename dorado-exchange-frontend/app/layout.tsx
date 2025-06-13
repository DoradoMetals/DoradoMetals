import type { Metadata } from 'next'
import {
  EB_Garamond,
  Forum,
  Josefin_Sans,
  Montserrat,
  Open_Sans,
  Poppins,
  Prompt,
  Roboto,
  Spectral,
} from 'next/font/google'
import './styles/globals.css'
import LayoutProvider from '@/components/providers/LayoutProvider' // ✅ Import the Client Component
import { ThemeProvider } from '@/components/custom/theme/theme-provider'
import QueryProvider from '@/components/providers/QueryProvider'
import GoogleMapsProvider from '@/components/providers/GoogleMapsProvider'
import GlobalGradients from '@/components/ui/gold-gradients'

export const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '600', '800'],
  variable: '--font-header',
})

export const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '600', '800'],
  variable: '--font-header',
})

export const forum = Forum({
  subsets: ['latin'],
  weight: ['400'],
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
    <html lang="en" suppressHydrationWarning className={`${montserrat.variable} ${openSans.variable}`}>
      <body className="bg-background antialiased">
        <ThemeProvider attribute="class" defaultTheme="light">
          <QueryProvider>
            <GoogleMapsProvider>
              <GlobalGradients />
              <LayoutProvider>{children}</LayoutProvider>
            </GoogleMapsProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
