"use client";

import { usePathname } from "next/navigation";
import Shell from "@/components/custom/nav/shell";
import { useUserStore } from "@/store/useUserStore";
import { useEffect } from "react";

export default function LayoutProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const authRoutes = ["/sign-in", "/sign-up", "/reset-password", '/verify-email'];

  const fetchSession = useUserStore((state) => state.fetchSession);

  useEffect(() => {
    fetchSession();
  }, []);

  const isAuthPage = authRoutes.includes(pathname);
  return (
    <>
        {
          isAuthPage
            ?
            children
            :
            <div>
              <Shell />
              {children}
            </div>
        }
    </>
  );
}
