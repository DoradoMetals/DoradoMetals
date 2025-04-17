"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { Address } from "@/types/address";
import AddressForm from "./addressForm";

export default function AddressModal({ address, open, setOpen, title }: { 
  address: Address;
  open: boolean; 
  setOpen: (open: boolean) => void; 
  title: string
}) {
  return (
    <Dialog modal={false} open={open} onOpenChange={setOpen}>
      <DialogContent className="bg-background">
        <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className='mb-4'>Please fill out the address details below.</DialogDescription>
        </DialogHeader>
        <AddressForm address={address} setOpen={setOpen} />
      </DialogContent>
    </Dialog>
  );
}