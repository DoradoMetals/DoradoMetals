"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function SignUpButton() {
  const router = useRouter();

  const handleSignUp = () => {
    router.push("/signup");
  };

  return (
    <Button variant="default" onClick={handleSignUp}>
      Sign Up
    </Button>
  );
}
