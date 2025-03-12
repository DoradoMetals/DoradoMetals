import { Suspense } from "react";
import ResetPasswordForm from "@/components/custom/auth/resetPasswordForm";

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
