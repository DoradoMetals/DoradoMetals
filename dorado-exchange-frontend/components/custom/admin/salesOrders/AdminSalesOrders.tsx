import { useState } from 'react'
import SalesOrderCards from './SalesOrderCards'
import SalesOrdersTable from './SalesOrderTable'

export default function AdminSalesOrders() {
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null)
  return (
    <div className="space-y-2">
      <SalesOrderCards selectedStatus={selectedStatus} setSelectedStatus={setSelectedStatus} />
      <SalesOrdersTable selectedStatus={selectedStatus} />
    </div>
  )
}
