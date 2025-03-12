import VerifyEmail from "@/components/custom/auth/verifyEmail";
import { Suspense } from "react";

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <VerifyEmail />
    </Suspense>
  );
}