"use client";

import { Button } from "@/components/ui/button";
import { useSignOut } from "@/lib/queries/useAuth";
import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const router = useRouter();
  const signOutMutation = useSignOut(); // ✅ Use TanStack Mutation

  return (
    <Button
      variant="destructive"
      onClick={() => signOutMutation.mutate(undefined, { onSuccess: () => router.push("/") })}
      disabled={signOutMutation.isPending}
    >
      {signOutMutation.isPending ? "Signing Out..." : "Sign Out"}
    </Button>
  );
}
