'use client'

import type { Address } from "@dorado/contracts";
import { X } from 'lucide-react'
import { Button, Drawer } from '@dorado/components'
import { useDrawerStore } from '@/shared/store/drawerStore'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { UserAddress } from '@/features/addresses/types'
import AddressForm from '@/features/addresses/ui/AddressForm'


interface AddressDrawerProps {
  onSuccess?: (address: Address, userAddress?: UserAddress) => void
}

export function AddressDrawer({ onSuccess }: AddressDrawerProps) {
  const activeDrawer = useDrawerStore((s) => s.activeDrawer)
  const closeDrawer = useDrawerStore((s) => s.closeDrawer)
  const address = useDrawerStore((s) => s.payload.address) ?? null
  const userAddress = useDrawerStore((s) => s.payload.userAddress) ?? null

  const isAddressOpen = activeDrawer === 'address'
  const pathname = usePathname()

  useEffect(() => {
    closeDrawer()
  }, [pathname, closeDrawer])

  return (
    <Drawer label="Address" open={isAddressOpen} setOpen={closeDrawer}>
      <Button
        variant="tertiary"
        size="icon"
        className="hidden sm:flex items-start justify-start"
        onClick={closeDrawer}
      >
        <X size={24} />
      </Button>

      <AddressForm
        key={address?.id ?? 'new'}
        address={address}
        userAddress={userAddress}
        onSuccess={onSuccess}
      />
    </Drawer>
  )
}
