"use client";

import { Separator } from "@/components/ui/separator";
import AccountForm from "./account-form";
import AddressForm from "./address-form";

export default function AccountTab() {
  return (
    <div className="mx-auto p-6 max-w-lg">
      <AccountForm />
      <div className="mb-10 mt-10">
        <Separator />
      </div>
      <AddressForm />
    </div>
  );
}

