'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import CheckoutAddressForm from './checkoutAddressForm'
import { Address } from '@/types/address'

interface CheckoutAddressModalProps {
  address: Address
  open: boolean
  setOpen: (open: boolean) => void
  title?: string
  onSuccess?: (address: Address) => void
}

export default function CheckoutAddressModal({
  address,
  open,
  setOpen,
  title = 'Create Address',
  onSuccess,
}: CheckoutAddressModalProps) {
  return (
    <Dialog modal={false} open={open} onOpenChange={setOpen}>
      <DialogContent className="bg-background">
        <DialogHeader>
          <DialogTitle className="mb-4">{title}</DialogTitle>
          <DialogDescription>Please fill out the address details below.</DialogDescription>
        </DialogHeader>
        <CheckoutAddressForm address={address} setOpen={setOpen} onSuccess={onSuccess} />
      </DialogContent>
    </Dialog>
  )
}
