'use client';
import { ReactNode } from "react";
import { useAuthorization } from "@/utils/useAuthorization";
import { redirect, useRouter } from "next/navigation";

interface ProtectedPageProps {
  children: ReactNode;
  requiredRoles: string[];
}

export default function ProtectedPage({ children, requiredRoles }: ProtectedPageProps) {
  if (!useAuthorization(requiredRoles)) {
    redirect("/sign-in");
  }
  return children;
}
