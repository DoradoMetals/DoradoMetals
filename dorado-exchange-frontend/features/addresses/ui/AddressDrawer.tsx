'use client'

import { Address } from '@/features/addresses/types'
import Drawer from '@/components/ui/drawer'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDrawerStore } from '@/store/drawerStore'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import AddressForm from './AddressForm'

interface AddressDrawerProps {
  address: Address
  onSuccess?: (address: Address) => void
}

export default function AddressDrawer({ address, onSuccess }: AddressDrawerProps) {
  const { activeDrawer, closeDrawer } = useDrawerStore()
  const isAddressOpen = activeDrawer === 'address'

  const title = !address.name && !address.line_1 ? 'Create New Address' : 'Edit Address'

  const pathname = usePathname()

  useEffect(() => {
    closeDrawer()
  }, [pathname, closeDrawer])

  return (
    <>
      <div>
        <Drawer
          open={isAddressOpen}
          setOpen={closeDrawer}
          className="bg-background border-border border-t-1 lg:border-none"
        >
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
        </Drawer>
      </div>
    </>
  )
}
