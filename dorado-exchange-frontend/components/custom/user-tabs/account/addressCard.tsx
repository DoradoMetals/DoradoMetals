"use client";

import { Address } from "@/types/address";
import { Button } from "@/components/ui/button";
import AddressDialog from "./addressDialog";
import { useState } from "react";
import { useDeleteAddress, useSetDefaultAddress } from "@/lib/queries/useAddresses";
import { useUserStore } from "@/store/useUserStore";

export default function AddressCard({address} : {address: Address}) {
  const { user } = useUserStore();

  const deleteAddressMutation = useDeleteAddress(user?.id);
  const setDefaultAddressMutation = useSetDefaultAddress(user?.id);

  const [open, setOpen] = useState(false);

  return (
    <div className="shadow-sm p-2 flex flex-col">
      <div className="flex items-center">
        <div className="mr-auto text-xl">
          {address.name}
        </div>
        <div className="ml-auto">
          {
            address.is_default
              ?
              <div className="text-xs text-primary font-extralight font-stretch-ultra-expanded tracking-widest">
                DEFAULT ADDRESS
              </div>
              :
              null
          }
        </div>
      </div>
      <div className="mb-4">

      
      {
        address.phone_number
          ?
          <div className="flex mr-auto">
            <div className="text-sm text-gray-500">
              {address.phone_number}
            </div>
          </div>
          :
          null
      }
      </div>

      <div className="flex flex-col mr-auto">
        <div className="flex items-center gap-2 text-md text-gray-500">
          {address.line_1}
          {address.line_2}
        </div>
        <div className="flex items-center gap-2 text-md text-gray-500">
          {address.city + ", "}
          {address.state + ", "}
          {address.zip}
        </div>
        <div className="flex items-center gap-2 text-md text-gray-500">
          {address.country}
        </div>
      </div>
      <div className="flex items-center ml-auto gap-6">
        {!address.is_default ?
          <Button variant="link" effect="hoverUnderline" className="m-0 my-0 p-0 hover:font-bold underline" onClick={() => {setDefaultAddressMutation.mutate(address)}}>
            Set Default
          </Button>
          : null
        }
        <Button variant="link" effect="hoverUnderline" className="m-0 p-0 underline" onClick={() => setOpen(true)}>
          Edit
        </Button>
        <Button variant="link" effect="hoverUnderline" className="m-0 p-0 underline" onClick={() => {deleteAddressMutation.mutate(address)}}>
          Remove
        </Button>
        <AddressDialog address={address} open={open} setOpen={setOpen} title="Edit" />
      </div>
    </div>
  );
}
