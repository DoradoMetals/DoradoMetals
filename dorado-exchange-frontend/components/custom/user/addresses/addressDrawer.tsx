'use client'

import { Address } from '@/types/address'
import Drawer from '@/components/ui/drawer'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDrawerStore } from '@/store/drawerStore'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import AddressForm from './addressForm'

interface AddressDrawerProps {
  address: Address
  onSuccess?: (address: Address) => void
}

export default function AddressDrawer({ address, onSuccess }: AddressDrawerProps) {
  const { activeDrawer, closeDrawer } = useDrawerStore()
  const isAddressOpen = activeDrawer === 'address'

  const title = !address.name && !address.line_1 ? 'Create New Address' : 'Edit Address'

  console.log(activeDrawer)

  const pathname = usePathname()

  useEffect(() => {
    closeDrawer()
  }, [pathname, closeDrawer])

  return (
    <>
      <div>
        <Drawer open={isAddressOpen} setOpen={closeDrawer}>
          <div className="h-full bg-background border-t-1 border-border lg:border-none flex flex-col p-4">
            <Button
              variant="ghost"
              size="icon"
              className="hidden sm:flex hover:bg-card p-2"
              onClick={closeDrawer}
            >
              <X size={24} className="text-neutral-900" />
            </Button>
            <div className="text-sm text-neutral-600 tracking-widest mt-8 mb-10">{title}</div>
            <AddressForm address={address} onSuccess={onSuccess} />
          </div>
        </Drawer>
      </div>
    </>
  )
}
