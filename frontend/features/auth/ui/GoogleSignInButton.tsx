"use client";

import { useGoogleSignIn } from "@/features/auth/queries";
import { Button } from '@dorado/components';
import { GoogleLogo } from '@dorado/icons';

export default function GoogleButton({buttonLabel} : {buttonLabel: string}) {
  const googleSignInMutation = useGoogleSignIn();

  return (
    <Button
      variant="secondary"
      className="w-full"
      onClick={() => googleSignInMutation.mutate()}
      disabled={googleSignInMutation.isPending}
    >
      <GoogleLogo />
      {googleSignInMutation.isPending ? "Signing In..." : buttonLabel}
    </Button>
  );
}
