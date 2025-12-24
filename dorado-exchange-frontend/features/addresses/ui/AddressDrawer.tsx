'use client'

import Drawer from '@/shared/ui/base/drawer'
import { X } from 'lucide-react'
import { Button } from '@/shared/ui/base/button'
import { useDrawerStore } from '@/shared/store/drawerStore'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { Address } from '@/features/addresses/types'
import AddressForm from '@/features/addresses/ui/AddressForm'


interface AddressDrawerProps {
  onSuccess?: (address: Address) => void
}

export function AddressDrawer({ onSuccess }: AddressDrawerProps) {
  const activeDrawer = useDrawerStore((s) => s.activeDrawer)
  const closeDrawer = useDrawerStore((s) => s.closeDrawer)
  const address = useDrawerStore((s) => s.payload.address) ?? null

  const isAddressOpen = activeDrawer === 'address'
  const pathname = usePathname()

  useEffect(() => {
    closeDrawer()
  }, [pathname, closeDrawer])

  return (
    <Drawer open={isAddressOpen} setOpen={closeDrawer} className="bg-background border-border border-t-1 lg:border-none">
      <Button
        variant="ghost"
        size="icon"
        className="hidden sm:flex items-start justify-start p-0"
        onClick={closeDrawer}
      >
        <X size={24} className="text-neutral-900" />
      </Button>

      <AddressForm
        key={address?.id ?? 'new'}
        address={address}
        onSuccess={onSuccess}
      />
    </Drawer>
  )
}
