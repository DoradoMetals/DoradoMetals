"use client";

import { Button } from "@/components/ui/button";
import { useSignOut } from "@/lib/queries/useAuth";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const router = useRouter();
  const signOutMutation = useSignOut(); // ✅ Use TanStack Mutation

  return (
    <Button
      variant="ghost"
      effect="expandIcon"
      iconPlacement="right"
      onClick={() => signOutMutation.mutate(undefined, { onSuccess: () => router.push("/") })}
      disabled={signOutMutation.isPending}
      icon={LogOut}
      className="px-3 h-8 py-1 text-md hover:bg-primary font-light border-primary"
    >
      {signOutMutation.isPending ? "Signing Out..." : "Sign Out"}
    </Button>
  );
}
