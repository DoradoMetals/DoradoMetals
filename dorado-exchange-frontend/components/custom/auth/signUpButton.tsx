"use client";

import { Button } from "@/components/ui/button";
import { LogOut, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";

export default function SignUpButton() {
  const router = useRouter();

  return (
    <Button
      variant="default"
      effect="expandIcon"
      iconPlacement="right"
      onClick={() => {router.push('/authentication?tab=sign-up')}}
      icon={UserPlus}
      className="px-6 py-1 text-md hover:bg-primary border-primary"
    >
      Sign Up
    </Button>
  );
}
