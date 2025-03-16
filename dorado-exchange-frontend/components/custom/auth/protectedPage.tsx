'use client';
import { ReactNode } from "react";
import { useAuthorization } from "@/utils/useAuthorization";
import { redirect } from "next/navigation";

interface ProtectedPageProps {
  children: ReactNode;
  requiredRoles: string[];
}

export default function ProtectedPage({ children, requiredRoles }: ProtectedPageProps) {
  const { authorized, loading } = useAuthorization(requiredRoles);

  if (loading) return null; // Don't show anything while loading
  if (!authorized) redirect("/unauthorized"); // Redirect if not authorized

  return children;
}
