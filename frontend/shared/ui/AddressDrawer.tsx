'use client'

import type { AddressBookEntry } from '@dorado/contracts'
import { Button, Drawer } from '@dorado/components'
import { X } from '@dorado/icons'
import { useDrawerStore } from '@/shared/store/drawerStore'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import AddressForm from '@/shared/ui/AddressForm'

export function AddressDrawer({ onSuccess }: { onSuccess?: (entry: AddressBookEntry) => void }) {
  const activeDrawer = useDrawerStore((s) => s.activeDrawer)
  const closeDrawer = useDrawerStore((s) => s.closeDrawer)
  // ONE PAYLOAD, NOT TWO. The drawer used to carry an address and its link as
  // separate slots, which is the join the browser is out of now.
  const entry = useDrawerStore((s) => s.payload.addressEntry) ?? null

  const pathname = usePathname()

  useEffect(() => {
    closeDrawer()
  }, [pathname, closeDrawer])

  return (
    <Drawer label="Address" open={activeDrawer === 'address'} setOpen={closeDrawer}>
      <Button
        variant="tertiary"
        size="icon"
        className="hidden sm:flex items-start justify-start"
        onClick={closeDrawer}
      >
        <X size={24} />
      </Button>

      <AddressForm key={entry?.address.id ?? 'new'} entry={entry} onSuccess={onSuccess} />
    </Drawer>
  )
}
