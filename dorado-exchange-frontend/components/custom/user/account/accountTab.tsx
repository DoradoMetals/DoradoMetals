"use client";

import { Separator } from "@/components/ui/separator";
import UserForm from "./user-form";
import AddressTab from "../addresses/addressTab";

export default function AccountTab() {
  return (
    <div className="mx-auto p-6 max-w-lg w-full">
      <UserForm />
      <div className="mb-10 mt-10">
        <Separator />
      </div>
      <AddressTab />
    </div>
  );
}

