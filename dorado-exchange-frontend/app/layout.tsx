import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import LayoutProvider from "@/components/providers/LayoutProvider"; // ✅ Import the Client Component

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
    <html lang="en">
      <body className={`bg-gray-100 ${geistSans.variable} ${geistMono.variable} antialiased`}>
        <LayoutProvider>{children}</LayoutProvider> {/* ✅ Wrap with client-side layout logic */}
      </body>
    </html>
  );
}
