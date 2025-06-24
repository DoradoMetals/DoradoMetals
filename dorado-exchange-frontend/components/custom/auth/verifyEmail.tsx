"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useVerifyEmail } from "@/lib/queries/useAuth";
import { Button } from "@/components/ui/button";
import { useSearchParams } from "next/navigation";

export default function VerifyEmail() {
  const router = useRouter();
  const verifyEmailMutation = useVerifyEmail();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  useEffect(() => {
    if (token) {
      verifyEmailMutation.mutate(token, {
        onSuccess: () => {
          setTimeout(() => router.push("/"), 3000);
        },
      });
    }
  }, [token]);

  return (
    <div className="flex flex-col items-center justify-center">
      {verifyEmailMutation.isPending && <p>Verifying your email...</p>}
      {verifyEmailMutation.isSuccess && <p>Email verified! Redirecting...</p>}
      {verifyEmailMutation.isError && (
        <div>
          <p className="text-destructive">Invalid or expired verification link.</p>
          <Button onClick={() => router.push("/")}>Go to Home</Button>
        </div>
      )}
    </div>
  );
}
