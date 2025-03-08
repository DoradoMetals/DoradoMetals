"use client"; // ✅ Mark this as a client component

import { usePathname } from "next/navigation";
import Shell from "@/components/custom/nav/shell";

export default function LayoutProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // List of auth pages that should NOT have the main layout
  const authRoutes = ["/sign-in", "/sign-up", "/reset-password"];

  const isAuthPage = authRoutes.includes(pathname);

  return (
    <>
      {!isAuthPage && <Shell />} {/* Show Shell only if NOT an auth page */}
      {children}
    </>
  );
}
