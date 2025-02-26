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

      {/* <div className="hidden xl:grid">
        <div className="grid xl:grid-cols-2 2xl:gridcols-1 px-4 lg:px-8 items-center py-2">
          <div className="justify-self-start px-4 lg:px-8">
            <Contact />
          </div>
          <div className="hidden md:flex justify-self-end">
            <SpotTicker />
          </div>
        </div>
      </div> */}

      <main className="flex-grow h-full w-full overflow-hidden">
        {children}
      </main>
    </div>
  );
}
