"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from '@dorado/components';
import { useVerifyEmail } from "@/shared/hooks/auth/queries";

export default function ChangeEmail() {
  const router = useRouter();
    const verifyEmailMutation = useVerifyEmail();
  
    const searchParams = useSearchParams();
    const token = searchParams.get("token");

    // Step one of two: this token is the OLD address approving the change. better-auth then mails the NEW address its own verification link, and only that link changes the email (api/domain/auth/client.ts, changeEmail).
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
    <div className="flex flex-col items-center justify-center">
      {verifyEmailMutation.isPending && <p>Approving your email change...</p>}
      {verifyEmailMutation.isSuccess && <p>Change approved. Check your new inbox for a verification link to finish. Redirecting...</p>}
      {verifyEmailMutation.isError && (
        <div>
          <p className="text-destructive">Invalid or expired email change link.</p>
          <Button onClick={() => router.push("/")}>Go to Home</Button>
        </div>
      )}
    </div>
  );
}
