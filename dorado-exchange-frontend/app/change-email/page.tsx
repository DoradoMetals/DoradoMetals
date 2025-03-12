import { Suspense } from "react";
import ChangeEmail from "@/components/custom/auth/changeEmail";

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <ChangeEmail />
    </Suspense>
  );
}
