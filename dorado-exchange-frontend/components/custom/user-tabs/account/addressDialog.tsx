"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { Address } from "@/types/address";
import AddressForm from "./addressForm";

export default function AddressModal({ address, open, setOpen, title }: { 
  address: Address;
  open: boolean; 
  setOpen: (open: boolean) => void; 
  title: string
}) {
  console.log(address)
  return (
    <Dialog modal={false} open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <AddressForm address={address} setOpen={setOpen} />
      </DialogContent>
    </Dialog>
  );
}