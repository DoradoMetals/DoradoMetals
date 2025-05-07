"use client";

import { useGoogleSignIn } from "@/lib/queries/useAuth";
import { FcGoogle } from "react-icons/fc";
import { Button } from "@/components/ui/button";

export default function GoogleButton({buttonLabel} : {buttonLabel: string}) {
  const googleSignInMutation = useGoogleSignIn();

  return (
    <Button
      variant="ghost"
      className="w-full bg-card raised-off-page shine-on-hover hover:bg-card"
      onClick={() => googleSignInMutation.mutate()}
      disabled={googleSignInMutation.isPending}
    >
      <FcGoogle className="text-4xl" />
      <span className="text-neutral-700 text-base">{googleSignInMutation.isPending ? "Signing In..." : buttonLabel}</span>
    </Button>
  );
}
