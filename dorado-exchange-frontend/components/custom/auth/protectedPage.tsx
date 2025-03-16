'use client';
import { ReactNode, useEffect, useState } from "react";
import { useAuthorization } from "@/utils/useAuthorization";
import { useRouter } from "next/navigation";
import { useUserStore } from "@/store/useUserStore";

interface ProtectedPageProps {
  children: ReactNode;
  requiredRoles: string[];
}

export default function ProtectedPage({ children, requiredRoles }: ProtectedPageProps) {
  const router = useRouter();
  const session = useUserStore((state) => state.session); // Get current session state
  const isAuthorized = useAuthorization(requiredRoles);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!session) {
      router.push("/sign-in"); // Redirect if there's no session
    } else if (!isAuthorized) {
      router.push("/"); // Redirect if not authorized
    } else {
      setChecking(false);
    }
  }, [session, isAuthorized, router]);

  if (checking) return null; // Prevent page from rendering while checking

  return children;
}
