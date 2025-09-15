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
      <PurchaseOrderCards selectedStatus={selectedStatus} setSelectedStatus={setSelectedStatus} />

      <div className="flex flex-col gap-1">
        <PurchaseOrdersTable selectedStatus={selectedStatus} />

        <div className="flex justify-end">
          <Button
            variant="ghost"
            className="p-0 w-full flex justify-end gap-1 text-destructive text-sm"
            onClick={() => purgeCancelled.mutate()}
            disabled={purgeCancelled.isPending}
          >
            <FileXIcon size={16} />
            {purgeCancelled.isPending ? 'Purging...' : 'Purge Cancelled'}
          </Button>
        </div>
      </div>
    </div>
  )
}
