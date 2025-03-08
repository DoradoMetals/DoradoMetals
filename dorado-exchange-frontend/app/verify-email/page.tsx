"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/authClient";
import { Button } from "@/components/ui/button";

export default function VerifyEmail() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    const token = searchParams.get("token");

    if (token) {
      authClient.verifyEmail({ query: { token } })
        .then(() => {
          setStatus("success");
          setTimeout(() => {
            router.push("/");
          }, 3000);
        })
        .catch(() => setStatus("error"));
    } else {
      setStatus("error");
    }
  }, [searchParams, router]);

  return (
    <div className="h-screen flex flex-col items-center justify-center">
      {status === "loading" && <p>Verifying your email...</p>}
      {status === "success" && <p>Email verified! Redirecting...</p>}
      {status === "error" && (
        <div>
          <p className="text-red-500">Invalid or expired verification link.</p>
          <Button onClick={() => router.push("/")}>Go to Home</Button>
        </div>
      )}
    </div>
  );
}
