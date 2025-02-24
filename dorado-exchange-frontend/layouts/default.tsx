import SpotTicker from "@/components/header/SpotTicker";
import { Navbar } from "@/components/header/Navbar";
import { Divider } from "@heroui/react";
import Contact from "@/components/header/Contact";

export default function DefaultLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex flex-col h-screen">
      {/* Navbar */}
      <Navbar />
      <Divider />

      {/* Contact Info & Spot Prices in One Row */}
      <div className="grid grid-cols-2 items-center px-4 lg:px-8 py-2">
        {/* Contact Section */}
        <div className="justify-self-start px-4 lg:px-8">
          <Contact />
        </div>

        {/* Spot Ticker Section */}
        <div className="flex justify-self-end">
          <SpotTicker />
        </div>

      </div>
      <Divider />
      <main className="container mx-auto max-w-10xl px-6 flex-grow pt-8">
        {children}
      </main>
    </div>
  );
}