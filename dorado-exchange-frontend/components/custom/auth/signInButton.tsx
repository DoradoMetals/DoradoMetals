"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function SignInButton() {
  const router = useRouter();

  const handleLogin = () => {
    router.push("/sign-in"); // Redirect to login page
  };

  return (
    <Button variant="default" onClick={handleLogin}>
      Sign In
    </Button>
  );
}