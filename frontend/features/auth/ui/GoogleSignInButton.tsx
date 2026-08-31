"use client";

import { useGoogleSignIn } from "@/features/auth/queries";
import { FcGoogle } from "react-icons/fc";
import { Button } from '@dorado/components';

export default function GoogleButton({buttonLabel} : {buttonLabel: string}) {
  const googleSignInMutation = useGoogleSignIn();

  return (
    <Button
      variant="secondary"
      className="w-full"
      onClick={() => googleSignInMutation.mutate()}
      disabled={googleSignInMutation.isPending}
    >
      <FcGoogle />
      {googleSignInMutation.isPending ? "Signing In..." : buttonLabel}
    </Button>
  );
}
