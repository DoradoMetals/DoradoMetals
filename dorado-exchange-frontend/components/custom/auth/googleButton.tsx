"use client";

import { useGoogleSignIn } from "@/lib/queries/useAuth"; // ✅ Use TanStack Query
import { FcGoogle } from "react-icons/fc";
import { Button } from "@/components/ui/button";

export default function GoogleButton(buttonLabel: string) {
  const googleSignInMutation = useGoogleSignIn(); // ✅ TanStack Query mutation

  return (
    <Button
      variant="ghost"
      className="w-full hover:bg-background flex items-center gap-3 py-3 mb-10"
      onClick={() => googleSignInMutation.mutate()}
      disabled={googleSignInMutation.isPending}
    >
      <FcGoogle className="text-4xl" />
      <span>{googleSignInMutation.isPending ? "Signing In..." : buttonLabel}</span>
    </Button>
  );
}
