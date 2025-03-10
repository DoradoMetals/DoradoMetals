import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import LayoutProvider from "@/components/providers/LayoutProvider"; // ✅ Import the Client Component
import { ThemeProvider } from "@/components/custom/theme/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dorado Metals Exchange",
  description: "Secure precious metals trading platform",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`bg-background ${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider attribute='class' defaultTheme="light">
          <LayoutProvider>{children}</LayoutProvider> {/* ✅ Wrap with client-side layout logic */}
        </ThemeProvider>
      </body>
    </html>
  );
}
