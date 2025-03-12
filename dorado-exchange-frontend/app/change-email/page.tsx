"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useVerifyEmail } from "@/lib/queries/useAuth";

export default function Page() {
  const router = useRouter();
    const verifyEmailMutation = useVerifyEmail();
  
    const searchParams = useSearchParams();
    const token = searchParams.get("token");
  
    useEffect(() => {
      if (token) {
        verifyEmailMutation.mutate(token, {
          onSuccess: () => {
            setTimeout(() => router.push("/account"), 3000);
          },
        });
      }
    }, [token]);
  

  return (
    <div className="h-screen flex flex-col items-center justify-center">
      {verifyEmailMutation.isPending && <p>Changing your email...</p>}
      {verifyEmailMutation.isSuccess && <p>Email changed! Redirecting...</p>}
      {verifyEmailMutation.isError && (
        <div>
          <p className="text-red-500">Invalid or expired email change link.</p>
          <Button onClick={() => router.push("/")}>Go to Home</Button>
        </div>
      )}
    </div>
  );
}
