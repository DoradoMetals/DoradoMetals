"use client";

import { Separator } from "@/components/ui/separator";
import UserForm from "./user-form";
import AddressForm from "./address-form";

export default function AccountTab() {
  return (
    <div className="mx-auto p-6 max-w-lg">
      <UserForm />
      <div className="mb-10 mt-10">
        <Separator />
      </div>
      <AddressForm />
    </div>
  );
}

