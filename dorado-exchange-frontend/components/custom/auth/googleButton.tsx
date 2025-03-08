import { authClient } from "@/lib/authClient";
import { FcGoogle } from "react-icons/fc";
import { Button } from "@/components/ui/button";

export default function googleButton(buttonLabel: string) {

  const handleGoogleSignIn = async () => {
    await authClient.signIn.social({
      provider: "google",
      callbackURL: process.env.NEXT_PUBLIC_FRONTEND_URL,
    });
  };

  return (
    <>
      <Button
        variant="ghost"
        className="w-full hover:bg-background flex items-center gap-3 py-3 mb-10"
        onClick={handleGoogleSignIn}
      >
        <FcGoogle className="text-4xl" />
        <span>{buttonLabel}</span>
      </Button>
    </>
  )
}