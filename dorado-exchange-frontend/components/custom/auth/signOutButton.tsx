"use client";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/authClient";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    setLoading(true);
    await authClient.signOut();
    router.push("/");
  };

  return (
    <Button variant="destructive" onClick={handleSignOut} disabled={loading}>
      {loading ? "Signing Out..." : "Sign Out"}
    </Button>
  );
}