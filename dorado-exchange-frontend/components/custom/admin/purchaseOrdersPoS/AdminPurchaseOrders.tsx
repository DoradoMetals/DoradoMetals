import { useState } from 'react'
import PurchaseOrderCards from './purchaseOrderCards'
import PurchaseOrdersTable from './purchaseOrdersTable'
import { Button } from '@/components/ui/button'
import { FileXIcon } from '@phosphor-icons/react'
import { usePurgeCancelled } from '@/lib/queries/admin/useAdminPurchaseOrders'

export default function AdminPurchaseOrders() {
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null)
  const purgeCancelled = usePurgeCancelled()
  return (
    <div className="flex flex-col w-full gap-3">
      <div className="flex justify-end">
        <Button
          className="w-full md:w-44 flex gap-3 p-4 raised-off-page bg-card text-destructive border-destructive border-1 hover:bg-destructive hover:text-white text-base"
          onClick={() => purgeCancelled.mutate()}
          disabled={purgeCancelled.isPending}
        >
          <FileXIcon size={24} />
          {purgeCancelled.isPending ? 'Purging...' : 'Purge Cancelled'}
        </Button>
      </div>

      <PurchaseOrderCards selectedStatus={selectedStatus} setSelectedStatus={setSelectedStatus} />
      <PurchaseOrdersTable selectedStatus={selectedStatus} />
    </div>
  )
}
