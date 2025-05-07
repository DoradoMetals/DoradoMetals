"use client";

import { Button } from "@/components/ui/button";
import { LogIn } from "lucide-react";
import { useRouter } from "next/navigation";

export default function SignInButton() {
  const router = useRouter();

  return (
    <Button
      variant="default"
      effect="expandIcon"
      iconPlacement="right"
      onClick={() => {router.push('/authentication?tab=sign-in')}}
      icon={LogIn}
      iconSize={20}
      className="px-4 py-2 h-8 liquid-gold raised-off-page shine-on-hover ml-2 text-white"
    >
      Sign In
    </Button>
  );
}
