"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/authClient";
import { Button } from "@/components/ui/button";

export default function VerifyEmail() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    let token: string | null = null;

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      token = params.get("token");
    }

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
  }, [router]);

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
