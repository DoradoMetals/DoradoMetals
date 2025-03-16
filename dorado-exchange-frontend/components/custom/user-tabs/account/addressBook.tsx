"use client";

import { Button } from "@/components/ui/button";
import { useUserStore } from "@/store/useUserStore";
import { useAddress } from "@/lib/queries/useAddresses";
import { Address } from "@/types/address";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus } from "lucide-react";
import AddressCard from "./addressCard";
import AddressDialog from "./addressDialog";
import { authClient } from "@/lib/authClient";

export default function AddressBook() {

  const {data: session} = authClient.useSession();
  const { data: addresses, isLoading } = useAddress();

  const [open, setOpen] = useState(false);

  const noAddresses = () => {
    if (!addresses || addresses.length === 0) {
      return true;
    }
    return false;
  };

  const defaultValues: Address = {
    id: crypto.randomUUID(),
    user_id: session?.user?.id ?? '',
    line_1: "",
    line_2: "",
    city: "",
    state: "",
    country: "United States",
    zip: "",
    name: "",
    is_default: noAddresses(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    phone_number: "",
  };

  return (
    <div className="flex flex-col">
      {isLoading ?
        <div className="space-y-4">
          <Skeleton className="h-9 w-full mb-8" />
          <Skeleton className="h-9 w-full mb-8" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-9 w-full mb-8" />
            <Skeleton className="h-9 w-full mb-8" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-9 w-full mb-8" />
            <Skeleton className="h-9 w-full mb-8" />
          </div>
          <Skeleton className="h-9 w-full mb-8" />
        </div>
        :
        <>
          <div className="flex items-center mb-10">
            <h2 className="text-sm text-gray-500">Addresses</h2>
            <Button className="ml-auto p-0 py-0 px-0 hover:bg-background" variant="ghost" onClick={() => setOpen(true)}>
              <div className="flex items-center gap-1 font-light">
                <Plus size={16} strokeWidth={1}/>
                Create New
              </div>
            </Button>
          </div>
          <div>
            {
              noAddresses()
                ?
                <div className="flex flex-col items-center">
                  <div className="flex justify-center font-light">
                    You don't have any saved Addresses.
                  </div>
                  <Button className="p-0 py-0 px-0 hover:bg-background" variant="ghost" onClick={() => setOpen(true)}>
                    <div className="text-primary flex items-center gap-2">
                      Create One Now
                    </div>
                  </Button>
                </div>
                :
                null
            }
            <div className="flex flex-col gap-3 justify-center">
              {addresses?.map((address, key) => (
                <AddressCard address={address} key={key} />
              ))}
            </div>

            <AddressDialog address={defaultValues} open={open} setOpen={setOpen} title="Create New Address" />
          </div>
        </>
      }
    </div>
  );
}
